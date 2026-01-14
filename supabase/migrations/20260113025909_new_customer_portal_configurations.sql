
drop table if exists customer_portal_configurations cascade;

create table customer_portal_configurations (
    -- customer portal id
    -- https://docs.stripe.com/customer-management/activate-no-code-customer-portal
  id text not null unique primary key,
  is_active boolean not null
);

insert into
  customer_portal_configurations (
    id,
    is_active
  )
values
  (
    'bpc_1SoYCqA4zKrgX9zs5pstKuhx',
    true
  );


-- Enable RLS
alter table customer_portal_configurations enable row level security;

create policy "all user can view customer_portal_configurations" on customer_portal_configurations for
select
  to authenticated using (true);
