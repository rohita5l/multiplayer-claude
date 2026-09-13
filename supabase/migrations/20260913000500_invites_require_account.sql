-- Invites are redeemed only by a signed-in account whose email matches the invite.
create or replace function public.redeem_invite(p_token text, p_display_name text default null, p_email text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_session uuid; v_role text; v_email text; v_hash text; v_uid uuid; v_jwt_email text;
begin
  v_uid := (select auth.uid());
  if v_uid is null then raise exception 'not signed in'; end if;
  if coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) then raise exception 'sign in with the invited email to join'; end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select session_id, role, email into v_session, v_role, v_email from public.session_invites
    where token_hash = v_hash and expires_at > now() and (max_uses is null or uses < max_uses);
  if v_session is null then raise exception 'invalid or expired invite'; end if;
  v_jwt_email := (select auth.jwt()->>'email');
  if v_email is not null and (v_jwt_email is null or lower(v_jwt_email) <> lower(v_email)) then
    raise exception 'this invite is for %', v_email;
  end if;
  insert into public.session_members (session_id, user_id, role, display_name)
    values (v_session, v_uid, v_role, p_display_name)
    on conflict (session_id, user_id) do update set display_name = coalesce(excluded.display_name, public.session_members.display_name), role = excluded.role;
  update public.session_invites set uses = uses + 1 where token_hash = v_hash;
  return v_session;
end $$;
