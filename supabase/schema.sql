-- =====================================================================
-- Radiance Car Wash - database setup for Supabase
-- Run this whole file ONCE in Supabase: SQL Editor > New query > Run.
-- =====================================================================

-- ---------- tables ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  phone       text not null unique,
  reg         text not null default '',
  role        text not null default 'customer' check (role in ('customer','admin')),
  monthly_req boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.settings (
  id            int primary key default 1 check (id = 1),
  banner_text   text not null default '',
  banner_active boolean not null default false,
  open_hour     smallint not null default 9  check (open_hour between 0 and 23),
  close_hour    smallint not null default 19 check (close_hour between 0 and 23),
  slot_capacity smallint not null default 2  check (slot_capacity > 0),
  booking_days  smallint not null default 7  check (booking_days between 1 and 60)
);
insert into public.settings (id) values (1);

create table public.prices (
  vehicle   text not null check (vehicle in ('small','sedan','large','premium','bike')),
  pack      text not null,
  pack_name text not null,
  price     int  not null check (price >= 0),
  sort      int  not null default 0,
  primary key (vehicle, pack)
);
insert into public.prices (vehicle, pack, pack_name, price, sort) values
  ('small','body','Body Wash',400,1),   ('sedan','body','Body Wash',450,1),   ('large','body','Body Wash',550,1),   ('premium','body','Body Wash',650,1),
  ('small','full','Full Wash',550,2),   ('sedan','full','Full Wash',650,2),   ('large','full','Full Wash',750,2),   ('premium','full','Full Wash',850,2),
  ('small','bodywax','Body Wash with Wax Polish',1100,3), ('sedan','bodywax','Body Wash with Wax Polish',1200,3), ('large','bodywax','Body Wash with Wax Polish',1350,3), ('premium','bodywax','Body Wash with Wax Polish',1500,3),
  ('small','fullwax','Full Wash with Wax Polish',1250,4), ('sedan','fullwax','Full Wash with Wax Polish',1400,4), ('large','fullwax','Full Wash with Wax Polish',1550,4), ('premium','fullwax','Full Wash with Wax Polish',1700,4),
  ('small','wax','Wax Polish',700,5),   ('sedan','wax','Wax Polish',750,5),   ('large','wax','Wax Polish',800,5),   ('premium','wax','Wax Polish',850,5),
  ('bike','foam','Foam Wash',200,1);

create table public.coupons (
  code       text primary key check (code = upper(code) and length(code) >= 3),
  type       text not null check (type in ('pct','flat')),
  value      numeric not null check (value > 0),
  active     boolean not null default true,
  expires    date,
  created_at timestamptz not null default now()
);

create table public.bookings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  vehicle      text not null,
  pack         text not null,
  price        int  not null,
  discount     int  not null default 0,
  coupon       text not null default '',
  date         date not null,
  time         smallint not null,
  status       text not null default 'booked' check (status in ('booked','completed','cancelled')),
  notes        text not null default '',
  cancelled_by text check (cancelled_by in ('customer','admin')),
  cancelled_on date,
  created_at   timestamptz not null default now()
);
create index bookings_date_idx on public.bookings (date, time);
create index bookings_user_idx on public.bookings (user_id);

create table public.monthly_packages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  plan       text not null,
  washes     int  not null check (washes > 0),
  used       int  not null default 0 check (used >= 0),
  amount     numeric not null default 0,
  start_date date not null,
  end_date   date not null,
  created_at timestamptz not null default now()
);

-- ---------- helper functions ----------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- "Today" at the shop (India time), whatever the server's clock zone is.
create function public.shop_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- Create the profile row when someone registers.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_phone text := coalesce(new.raw_user_meta_data->>'phone','');
begin
  if v_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit mobile number.';
  end if;
  insert into public.profiles (id, name, phone, reg)
  values (new.id,
          coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),'Customer'),
          v_phone,
          upper(coalesce(new.raw_user_meta_data->>'reg','')));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Customers may edit their name and vehicle number, never their role or mobile.
create function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.phone := old.phone;
    new.id := old.id;
  end if;
  return new;
end $$;
create trigger protect_profile before update on public.profiles
  for each row execute function public.protect_profile();

-- How many vehicles are booked in each slot (no customer details exposed).
create function public.slot_counts(p_from date, p_to date)
returns table (d date, t smallint, n int)
language sql stable security definer set search_path = public as $$
  select b.date, b.time, count(*)::int
  from public.bookings b
  where auth.uid() is not null and b.status = 'booked' and b.date between p_from and p_to
  group by b.date, b.time;
$$;

-- Price for a vehicle + package, with an optional coupon code.
create function public.price_quote(p_vehicle text, p_pack text, p_code text default '')
returns json
language plpgsql stable security definer set search_path = public as $$
declare v_base int; v_disc int := 0; c public.coupons;
begin
  if auth.uid() is null then raise exception 'Please log in.'; end if;
  select price into v_base from public.prices where vehicle = p_vehicle and pack = p_pack;
  if v_base is null then raise exception 'That package is not available for this vehicle.'; end if;
  if coalesce(trim(p_code),'') <> '' then
    select * into c from public.coupons
      where code = upper(trim(p_code)) and active and (expires is null or expires >= public.shop_today());
    if not found then raise exception 'That coupon code is not valid right now.'; end if;
    v_disc := case when c.type = 'pct' then round(v_base * c.value / 100.0)::int
                   else least(c.value::int, v_base) end;
  end if;
  return json_build_object('base', v_base, 'discount', v_disc, 'total', v_base - v_disc,
                           'code', c.code, 'type', c.type, 'value', c.value);
end $$;

-- Customers book through this function so price, hours and slot limits are
-- always checked on the server.
create function public.create_booking(p_vehicle text, p_pack text, p_date date, p_time int,
                                      p_notes text default '', p_code text default '')
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare s public.settings; q json; n int; b public.bookings;
        v_today date := public.shop_today();
        v_hour  int  := extract(hour from now() at time zone 'Asia/Kolkata');
begin
  if auth.uid() is null then raise exception 'Please log in.'; end if;
  select * into s from public.settings where id = 1;
  if p_date < v_today or p_date > v_today + (s.booking_days - 1) then
    raise exception 'Pick a day within the next % days.', s.booking_days;
  end if;
  if p_time < s.open_hour or p_time > s.close_hour then
    raise exception 'Pick a time during opening hours.';
  end if;
  if p_date = v_today and p_time <= v_hour then
    raise exception 'That time has already passed. Pick a later time.';
  end if;
  q := public.price_quote(p_vehicle, p_pack, p_code);
  perform pg_advisory_xact_lock(hashtext(p_date::text || ':' || p_time::text));
  select count(*) into n from public.bookings where date = p_date and time = p_time and status = 'booked';
  if n >= s.slot_capacity then
    raise exception 'That time is full. Pick another time.';
  end if;
  insert into public.bookings (user_id, vehicle, pack, price, discount, coupon, date, time, notes)
  values (auth.uid(), p_vehicle, p_pack, (q->>'total')::int, (q->>'discount')::int,
          coalesce(q->>'code',''), p_date, p_time, left(coalesce(p_notes,''), 500))
  returning * into b;
  return b;
end $$;

create function public.cancel_booking(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.bookings
     set status = 'cancelled', cancelled_by = 'customer', cancelled_on = public.shop_today()
   where id = p_id and user_id = auth.uid() and status = 'booked';
  if not found then raise exception 'This booking cannot be cancelled.'; end if;
end $$;

-- Lets the admin set a new password for a customer who forgot theirs.
create function public.admin_set_password(p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if length(coalesce(p_password,'')) < 6 then raise exception 'Password needs at least 6 characters.'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
   where id = p_user;
  if not found then raise exception 'Customer not found.'; end if;
end $$;

revoke execute on function public.slot_counts(date, date), public.price_quote(text, text, text),
  public.create_booking(text, text, date, int, text, text), public.cancel_booking(uuid),
  public.admin_set_password(uuid, text) from public, anon;
grant execute on function public.slot_counts(date, date), public.price_quote(text, text, text),
  public.create_booking(text, text, date, int, text, text), public.cancel_booking(uuid),
  public.admin_set_password(uuid, text) to authenticated;

-- ---------- row level security ----------
alter table public.profiles         enable row level security;
alter table public.settings         enable row level security;
alter table public.prices           enable row level security;
alter table public.coupons          enable row level security;
alter table public.bookings         enable row level security;
alter table public.monthly_packages enable row level security;

create policy "own profile or admin: read"   on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "own profile or admin: update" on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

create policy "everyone signed in reads settings" on public.settings for select to authenticated using (true);
create policy "admin updates settings"            on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "everyone reads prices" on public.prices for select to anon, authenticated using (true);
create policy "admin manages prices"  on public.prices for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admin manages coupons" on public.coupons for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "own bookings or admin: read" on public.bookings for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "admin manages bookings"      on public.bookings for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "own package or admin: read" on public.monthly_packages for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "admin manages packages"     on public.monthly_packages for all to authenticated using (public.is_admin()) with check (public.is_admin());
