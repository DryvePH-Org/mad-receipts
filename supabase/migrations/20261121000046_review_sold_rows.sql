-- The review list (Data check) can hold a row of the sold list that has no usable plate: a person types the plate and the row becomes a sale record.
-- The row itself is kept on the item (payload) so nothing is lost while it waits.

alter table public.docs_review_items drop constraint if exists docs_review_items_kind_check;
alter table public.docs_review_items add constraint docs_review_items_kind_check
  check (kind in ('duplicate_plate', 'no_plate', 'status_disagree', 'legacy_classification', 'odd_date', 'odd_plate', 'unknown_value', 'other', 'sold_no_plate'));
alter table public.docs_review_items add column if not exists payload jsonb;
create unique index if not exists docs_review_items_payload_key on public.docs_review_items ((payload ->> 'rowKey')) where payload ->> 'rowKey' is not null;
