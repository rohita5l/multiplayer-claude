-- Multiplayer Claude Code: core schema
create extension if not exists pgcrypto;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  anthropic_key_ciphertext text,
  anthropic_key_last4 text,
  key_validated_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Browser-visible view: never exposes the ciphertext
create view public.profile_public
  with (security_invoker = true) as
  select id, email, display_name, anthropic_key_last4, key_validated_at from public.profiles;

create policy "profiles: self read" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles: self update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: self insert" on public.profiles for insert to authenticated with check (id = (select auth.uid()));

-- auto-create profile on signup
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email,''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- sessions ----------
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled session',
  repo_url text not null,
  sandbox_name text,
  snapshot_id text,
  claude_session_id text,
  session_secret text,
  status text not null default 'creating', -- creating | running | stopped | error
  ws_url text,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);
alter table public.sessions enable row level security;

create table public.session_members (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','reviewer')),
  display_name text,
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
alter table public.session_members enable row level security;

-- helper to avoid recursive RLS
create or replace function public.is_session_member(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.session_members m where m.session_id = p_session and m.user_id = (select auth.uid()));
$$;

create policy "sessions: members read" on public.sessions for select to authenticated using (public.is_session_member(id));
create policy "sessions: owner update" on public.sessions for update to authenticated using (owner_id = (select auth.uid()));
create policy "sessions: owner delete" on public.sessions for delete to authenticated using (owner_id = (select auth.uid()));

create policy "members: members read" on public.session_members for select to authenticated using (public.is_session_member(session_id));

-- Browser-safe view (no secrets)
create view public.session_public with (security_invoker = true) as
  select id, owner_id, title, repo_url, status, claude_session_id is not null as has_claude_session, created_at, last_active_at
  from public.sessions;

-- ---------- invites ----------
create table public.session_invites (
  token_hash text primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  role text not null default 'reviewer',
  expires_at timestamptz not null,
  max_uses int,
  uses int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.session_invites enable row level security; -- no policies: RPC / service only

create or replace function public.redeem_invite(p_token text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_session uuid; v_role text; v_hash text; v_uid uuid;
begin
  v_uid := (select auth.uid());
  if v_uid is null then raise exception 'not signed in'; end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select session_id, role into v_session, v_role from public.session_invites
    where token_hash = v_hash and expires_at > now() and (max_uses is null or uses < max_uses);
  if v_session is null then raise exception 'invalid or expired invite'; end if;
  insert into public.session_members (session_id, user_id, role, display_name)
    values (v_session, v_uid, v_role, p_display_name)
    on conflict (session_id, user_id) do update set display_name = coalesce(excluded.display_name, public.session_members.display_name);
  update public.session_invites set uses = uses + 1 where token_hash = v_hash;
  return v_session;
end $$;
revoke execute on function public.redeem_invite(text, text) from public, anon;
grant execute on function public.redeem_invite(text, text) to authenticated;

-- ---------- comments ----------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  file_path text not null,
  line_start int not null,
  line_end int not null,
  side text not null default 'new' check (side in ('new','old')),
  body text not null,
  status text not null default 'open' check (status in ('open','addressed','resolved')),
  parent_id uuid references public.comments(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.comments enable row level security;
create index comments_session_idx on public.comments (session_id, created_at);

create policy "comments: members read" on public.comments for select to authenticated using (public.is_session_member(session_id));
create policy "comments: members insert" on public.comments for insert to authenticated
  with check (public.is_session_member(session_id) and author_id = (select auth.uid()));
create policy "comments: author or owner update" on public.comments for update to authenticated
  using (author_id = (select auth.uid()) or exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = (select auth.uid())));

alter publication supabase_realtime add table public.comments;
alter table public.comments replica identity full;
