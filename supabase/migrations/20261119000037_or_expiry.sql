-- One clean OR expiry date per car. The Docs Bible kept it as free text (`renewal`: 09/01/2027 next to 2027-09-01), the price list, the renewal tab and
-- the old on-hand register each kept their own copy. `renewal` stays exactly as typed (nothing is lost); `or_expiry` is the real date the app works with,
-- kept in step by a trigger whenever `renewal` is typed or edited. A text that is not a clear date stays in `or_expiry_raw`.

create function public.parse_sheet_date(t text) returns date language plpgsql immutable set search_path = '' as $$
declare s text := btrim(coalesce(t, '')); m text[]; d date;
begin
  if s = '' then return null; end if;
  begin
    m := regexp_match(s, '^(\d{4})-(\d{2})-(\d{2})');
    if m is not null then d := make_date(m[1]::int, m[2]::int, m[3]::int);
    else
      m := regexp_match(s, '^(\d{1,2})/(\d{1,2})/(\d{4})$');                  -- month first, as the sheets are set up
      if m is not null then d := make_date(m[3]::int, m[1]::int, m[2]::int);
      else
        m := regexp_match(s, '^(\d{1,2})/(\d{1,2})/(\d{2})$');
        if m is not null then d := make_date(2000 + m[3]::int, m[1]::int, m[2]::int);
        else
          m := regexp_match(s, '^(\d{1,2})/(\d{4})$');                         -- "05/2027": the first of that month
          if m is not null then d := make_date(m[2]::int, m[1]::int, 1);
          end if;
        end if;
      end if;
    end if;
  exception when others then
    return null;
  end;
  if d is not null and (d < date '2000-01-01' or d > date '2100-12-31') then return null; end if;
  return d;
end $$;

alter table public.docs_units add column if not exists or_expiry date;
alter table public.docs_units add column if not exists or_expiry_raw text;

-- the dates already typed (the change history and the updated-at stamp are paused for this one fill: it is the same date, in a clean column)
alter table public.docs_units disable trigger docs_units_track_trg;
alter table public.docs_units disable trigger docs_units_set_updated_at;
update public.docs_units
  set or_expiry = public.parse_sheet_date(renewal),
      or_expiry_raw = case when public.parse_sheet_date(renewal) is null and btrim(coalesce(renewal, '')) <> '' then btrim(renewal) end
  where renewal is not null;
alter table public.docs_units enable trigger docs_units_track_trg;
alter table public.docs_units enable trigger docs_units_set_updated_at;

create function public.docs_units_or_expiry() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.renewal is distinct from old.renewal then
    new.or_expiry := public.parse_sheet_date(new.renewal);
    new.or_expiry_raw := case when new.or_expiry is null and btrim(coalesce(new.renewal, '')) <> '' then btrim(new.renewal) end;
  end if;
  return new;
end $$;
create trigger docs_units_or_expiry before insert or update of renewal on public.docs_units for each row execute function public.docs_units_or_expiry();
create index if not exists docs_units_or_expiry_idx on public.docs_units (or_expiry) where or_expiry is not null;

-- the price list check may now also hold an OR expiry that two sources date differently
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.car_sync_items'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%arrival_date%' loop
    execute format('alter table public.car_sync_items drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.car_sync_items add constraint car_sync_items_field_check check (field in (
  'arrival_date', 'model', 'color', 'mileage', 'fuel', 'encumbrance', 'year', 'brand', 'trans', 'spare_key', 'status', 'docs_code', 'unmatched', 'odd_value', 'or_expiry'));
