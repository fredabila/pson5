create table if not exists "public"."pson_profiles_current" (
  profile_id text primary key,
  user_id text not null,
  profile_revision integer not null,
  profile_document jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists "public"."pson_profile_revisions" (
  profile_id text not null,
  revision integer not null,
  profile_document jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (profile_id, revision)
);

create table if not exists "public"."pson_user_profile_index" (
  user_id text primary key,
  latest_profile_id text not null,
  profile_ids jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_pson_profiles_current_user_id on "public"."pson_profiles_current" (user_id);
create index if not exists idx_pson_profile_revisions_profile_id on "public"."pson_profile_revisions" (profile_id);
