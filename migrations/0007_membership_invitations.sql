-- Pending invitations are membership rows. Keep the legacy invitations table
-- for historical compatibility, but move its pending data into memberships.
pragma foreign_keys = off;

create table organization_members_new (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  user_id text references users(id) on delete cascade,
  invite_email text,
  role text not null check (role in ('owner', 'admin', 'facilitator', 'member', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'inactive')),
  invite_token_hash text unique,
  invite_expires_at text,
  invited_at text,
  accepted_at text,
  joined_at text,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp,
  unique (organization_id, user_id)
);

insert into organization_members_new
  (id, organization_id, user_id, invite_email, role, status, invited_at, accepted_at, joined_at, created_at, updated_at)
select om.id, om.organization_id, om.user_id, u.email, om.role, om.status,
       case when om.status = 'invited' then om.created_at end,
       case when om.status = 'active' then om.joined_at end,
       om.joined_at, om.created_at, om.updated_at
from organization_members om
join users u on u.id = om.user_id;

drop table organization_members;
alter table organization_members_new rename to organization_members;

create unique index idx_organization_members_single_owner
  on organization_members(organization_id) where role = 'owner';
create unique index idx_organization_members_pending_email
  on organization_members(organization_id, lower(invite_email))
  where status = 'invited' and invite_email is not null;
create index idx_org_members_org on organization_members(organization_id);
create index idx_org_members_user on organization_members(user_id);
create index idx_org_members_role on organization_members(role);
create index idx_org_members_status on organization_members(status);

insert into organization_members
  (id, organization_id, user_id, invite_email, role, status, invite_token_hash, invite_expires_at, invited_at, created_at, updated_at)
select 'invitation-' || i.id, i.organization_id,
       (select u.id from users u where lower(u.email) = lower(i.email) limit 1),
       lower(i.email), i.role, 'invited', i.token_hash, i.expires_at, i.created_at, i.created_at, i.created_at
from invitations i
where i.status = 'pending'
  and not exists (
    select 1 from organization_members om
    where om.organization_id = i.organization_id
      and lower(om.invite_email) = lower(i.email)
  );

pragma foreign_keys = on;
