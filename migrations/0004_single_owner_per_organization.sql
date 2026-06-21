create unique index idx_organization_members_single_owner
on organization_members(organization_id)
where role = 'owner';
