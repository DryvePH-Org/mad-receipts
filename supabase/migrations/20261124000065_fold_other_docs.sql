-- Step 5a of the clean database (Docs/DATABASE_PLAN.md): "OTHER DOCS ATTACHED" (a free text, 18 cars) is a note, so it joins the one remarks note
-- ("Other papers: ..."). Nothing is dropped here (migration 66 does that, after the code is deployed). Safe to run twice: a car already folded is skipped.
-- Run this BEFORE pushing the code that no longer shows the column.

alter table public.docs_units disable trigger docs_units_set_updated_at;
update public.docs_units
  set remarks = concat_ws(E'\n\n', nullif(btrim(remarks), ''), 'Other papers: ' || btrim(other_docs))
  where nullif(btrim(other_docs), '') is not null and coalesce(remarks, '') not like '%Other papers: ' || btrim(other_docs) || '%';
alter table public.docs_units enable trigger docs_units_set_updated_at;
