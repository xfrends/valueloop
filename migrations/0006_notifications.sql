create table notifications (
    id text primary key,
    organization_id text not null references organizations(id) on delete cascade,
    recipient_member_id text not null references organization_members(id) on delete cascade,
    type text not null,
    title text not null,
    message text not null,
    entity_type text,
    entity_id text,
    payload text not null default '{}' check (json_valid(payload)),
    source_event_id text not null,
    read_at text,
    created_at text not null default current_timestamp
);

create index idx_notifications_recipient_created
    on notifications(organization_id, recipient_member_id, created_at);
create index idx_notifications_recipient_read
    on notifications(organization_id, recipient_member_id, read_at);
create index idx_notifications_source_recipient
    on notifications(source_event_id, recipient_member_id);
