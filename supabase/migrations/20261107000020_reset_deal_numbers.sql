-- Lets the Admin's "Delete all transactions" start the deal numbers again at D1001.
-- Only the server (service role) may call it, and the app only does so after every deal is deleted.
create or replace function public.reset_deal_numbers()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.deals) then
    raise exception 'deals_exist';
  end if;
  perform setval('public.deal_no_seq', 1001, false);
end;
$$;
revoke all on function public.reset_deal_numbers() from public, anon, authenticated;
grant execute on function public.reset_deal_numbers() to service_role;
