-- Pre-booted sandboxes waiting to be claimed by a new session (service-role only).
create table public.sandbox_pool (
  name text primary key,
  status text not null default 'creating', -- creating | ready
  created_at timestamptz not null default now()
);
alter table public.sandbox_pool enable row level security; -- no policies: service role only
