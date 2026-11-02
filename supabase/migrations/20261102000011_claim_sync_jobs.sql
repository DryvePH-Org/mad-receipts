-- Hands out due sync jobs to one worker at a time. A claimed job's next_run_at moves
-- 5 minutes ahead as a lease: if the worker dies, the job becomes due again by itself.
-- Called by the sync runner with the service role only.
create function public.claim_sync_jobs(p_limit int default 20, p_receipt_id uuid default null)
returns setof public.sync_jobs
language sql
security definer
set search_path = ''
as $$
  update public.sync_jobs j
  set next_run_at = now() + interval '5 minutes'
  where j.id in (
    select id from public.sync_jobs
    where status <> 'done'
      and attempts < 5
      and next_run_at <= now()
      and (p_receipt_id is null or receipt_id = p_receipt_id)
    order by next_run_at, created_at
    limit p_limit
    for update skip locked
  )
  returning j.*;
$$;

revoke execute on function public.claim_sync_jobs(int, uuid) from public, anon, authenticated;
grant execute on function public.claim_sync_jobs(int, uuid) to service_role;
