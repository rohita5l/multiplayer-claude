-- Roles: owner | editor | commenter (reviewer -> commenter). Invites are bound to an email.
alter table public.session_members drop constraint if exists session_members_role_check;
update public.session_members set role = 'commenter' where role = 'reviewer';
alter table public.session_members add constraint session_members_role_check check (role in ('owner','editor','commenter'));

alter table public.session_invites add column if not exists email text;
update public.session_invites set role = 'commenter' where role = 'reviewer';

drop function if exists public.redeem_invite(text, text);
create or replace function public.redeem_invite(p_token text, p_display_name text default null, p_email text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_session uuid; v_role text; v_email text; v_hash text; v_uid uuid; v_jwt_email text;
begin
  v_uid := (select auth.uid());
  if v_uid is null then raise exception 'not signed in'; end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select session_id, role, email into v_session, v_role, v_email from public.session_invites
    where token_hash = v_hash and expires_at > now() and (max_uses is null or uses < max_uses);
  if v_session is null then raise exception 'invalid or expired invite'; end if;
  if v_email is not null then
    -- signed-in accounts must match by their verified JWT email; guests supply the invited email
    v_jwt_email := coalesce((select auth.jwt()->>'email'), p_email);
    if v_jwt_email is null or lower(v_jwt_email) <> lower(v_email) then
      raise exception 'this invite is for a different email address';
    end if;
  end if;
  insert into public.session_members (session_id, user_id, role, display_name)
    values (v_session, v_uid, v_role, p_display_name)
    on conflict (session_id, user_id) do update set display_name = coalesce(excluded.display_name, public.session_members.display_name), role = excluded.role;
  update public.session_invites set uses = uses + 1 where token_hash = v_hash;
  return v_session;
end $$;
revoke execute on function public.redeem_invite(text, text, text) from public, anon;
grant execute on function public.redeem_invite(text, text, text) to authenticated;

-- Token-gated invite lookup for the join page (only what the joiner needs).
create or replace function public.invite_info(p_token text)
returns table (email text, role text, session_title text, expired boolean)
language sql security definer set search_path = '' as $$
  select i.email, i.role, s.title, (i.expires_at <= now() or (i.max_uses is not null and i.uses >= i.max_uses)) as expired
  from public.session_invites i join public.sessions s on s.id = i.session_id
  where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;
grant execute on function public.invite_info(text) to anon, authenticated;
