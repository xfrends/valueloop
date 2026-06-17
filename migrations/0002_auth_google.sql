alter table users add column google_sub text;
alter table users add column auth_provider text not null default 'password'
  check (auth_provider in ('password', 'google'));

create unique index if not exists idx_users_google_sub on users(google_sub) where google_sub is not null;
