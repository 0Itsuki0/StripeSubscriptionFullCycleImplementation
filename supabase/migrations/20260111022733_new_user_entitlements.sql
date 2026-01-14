drop type if exists subscription_status cascade;

create type subscription_status as enum(
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused'
);

drop table if exists user_entitlements cascade;

create table user_entitlements (
  id uuid not null primary key references auth.users (id) on delete cascade,
  plan_id bigint default null references subscription_plans (id) on delete set null,
  subscription_id text default null,
  stripe_customer_id text default null,
  subscription_status subscription_status default null,
  current_period_start timestamp with time zone default null,
  current_period_end timestamp with time zone default null,
  -- A date in the future at which the subscription will automatically get canceled
  -- null: no subscription for the user or not cancelling
  cancel_at timestamp with time zone default null,
  -- null: will be cancelled (at the end of current period end) or no subscription
  -- same as current_plan_id: auto renew
  -- different id: downgrade to a different plan (upgrade will be applied immediately)
  next_period_plan_id bigint default null references subscription_plans (id) on delete set null,
  trial_end timestamp with time zone default null,
  trial_used boolean not null default false
);

create index if not exists user_entitlements_subscription_index on user_entitlements using btree (subscription_id);
create index if not exists user_entitlements_stripe_customer_id_index on user_entitlements using btree (stripe_customer_id);


-- Enable RLS
alter table user_entitlements enable row level security;

create policy "user can select their own user_entitlements" on user_entitlements for
select
  to authenticated using (
    (
      select
        auth.uid ()
    ) = id
  );

-- enable real time postgres changes
alter publication supabase_realtime
add table user_entitlements;
