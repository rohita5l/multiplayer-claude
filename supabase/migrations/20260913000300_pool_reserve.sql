-- Atomic pool reservation: only one caller can reserve a slot when the pool is below size.
create or replace function public.reserve_pool_slot(p_name text, p_size int)
returns text language plpgsql security definer set search_path = '' as $$
declare v_fresh int;
begin
  perform pg_advisory_xact_lock(7241001);
  delete from public.sandbox_pool where status = 'creating' and created_at < now() - interval '90 seconds';
  select count(*) into v_fresh from public.sandbox_pool where status = 'ready' or created_at > now() - interval '90 seconds';
  if v_fresh >= p_size then return null; end if;
  insert into public.sandbox_pool (name, status) values (p_name, 'creating');
  return p_name;
end $$;
revoke execute on function public.reserve_pool_slot(text, int) from public, anon, authenticated;
