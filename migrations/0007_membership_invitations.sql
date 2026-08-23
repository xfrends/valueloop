-- Pending invitations are represented directly by organization_members.
alter table users add column is_placeholder integer not null default 0 check (is_placeholder in (0, 1));
alter table organization_members add column invite_email text;
alter table organization_members add column invite_token_hash text;
alter table organization_members add column invite_expires_at text;
alter table organization_members add column invited_at text;
alter table organization_members add column accepted_at text;

update organization_members
set invite_email = (select email from users where users.id = organization_members.user_id)
where invite_email is null;

insert or ignore into users (id, full_name, email, platform_role, is_placeholder, created_at, updated_at)
select 'pending-user-' || i.id, i.email, lower(i.email), 'none', 1, i.created_at, i.created_at
from invitations i
where i.status = 'pending'
  and not exists (select 1 from users u where lower(u.email) = lower(i.email));

insert into organization_members
  (id, organization_id, user_id, invite_email, role, status, invite_token_hash, invite_expires_at, invited_at, created_at, updated_at)
select
  'invitation-' || i.id,
  i.organization_id,
  (select u.id from users u where lower(u.email) = lower(i.email) limit 1),
  lower(i.email), i.role, 'invited', i.token_hash, i.expires_at, i.created_at, i.created_at, i.created_at
from invitations i
where i.status = 'pending'
  and not exists (
    select 1 from organization_members om
    where om.organization_id = i.organization_id and lower(om.invite_email) = lower(i.email)
  );

create unique index if not exists idx_organization_members_pending_email
  on organization_members(organization_id, lower(invite_email))
  where status = 'invited' and invite_email is not null;
create unique index if not exists idx_organization_members_invite_token
  on organization_members(invite_token_hash)
  where invite_token_hash is not null;
