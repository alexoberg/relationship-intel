-- Relationship Intelligence Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  full_name text,
  avatar_url text,
  google_access_token text,
  google_refresh_token text,
  google_token_expiry timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Contacts table
create table public.contacts (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references public.profiles(id) on delete cascade not null,

  -- Basic info
  first_name text,
  last_name text,
  full_name text not null,
  email text,
  linkedin_url text,
  phone text,

  -- Current position
  current_title text,
  current_company text,
  current_company_industry text,

  -- Categorization
  category text check (category in ('vc', 'angel', 'sales_prospect', 'irrelevant', 'uncategorized')) default 'uncategorized',
  category_confidence float default 0,
  category_source text check (category_source in ('rule', 'ai', 'manual')) default 'rule',

  -- Scoring
  proximity_score integer default 0,
  last_interaction_at timestamp with time zone,
  interaction_count integer default 0,

  -- Enrichment status
  enriched boolean default false,
  enriched_at timestamp with time zone,
  pdl_id text,

  -- Source tracking
  source text check (source in ('linkedin_csv', 'gmail', 'gcal', 'manual')) not null,

  -- Metadata
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,

  -- Prevent duplicates per user
  unique(owner_id, email),
  unique(owner_id, linkedin_url)
);

-- Work history table (from PDL enrichment)
create table public.work_history (
  id uuid default uuid_generate_v4() primary key,
  contact_id uuid references public.contacts(id) on delete cascade not null,

  company_name text not null,
  company_industry text,
  company_size text,
  company_linkedin_url text,

  title text not null,
  start_date date,
  end_date date,
  is_current boolean default false,

  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Email interactions (from Gmail sync)
create table public.email_interactions (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  contact_id uuid references public.contacts(id) on delete cascade,

  gmail_message_id text unique not null,
  thread_id text,
  subject text,
  snippet text,
  direction text check (direction in ('sent', 'received')) not null,
  email_date timestamp with time zone not null,

  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Calendar interactions (from GCal sync)
create table public.calendar_interactions (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  contact_id uuid references public.contacts(id) on delete cascade,

  gcal_event_id text unique not null,
  summary text,
  event_start timestamp with time zone not null,
  event_end timestamp with time zone,

  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Known VC/Angel firms for categorization rules
create table public.known_firms (
  id uuid default uuid_generate_v4() primary key,
  name text not null unique,
  type text check (type in ('vc', 'angel_network', 'pe', 'accelerator')) not null,
  aliases text[], -- Alternative names
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Insert some known VC firms
insert into public.known_firms (name, type, aliases) values
  ('Sequoia Capital', 'vc', array['Sequoia']),
  ('Andreessen Horowitz', 'vc', array['a16z', 'Andreessen']),
  ('Accel', 'vc', array['Accel Partners']),
  ('Benchmark', 'vc', array['Benchmark Capital']),
  ('Greylock Partners', 'vc', array['Greylock']),
  ('Kleiner Perkins', 'vc', array['KPCB', 'Kleiner']),
  ('Lightspeed Venture Partners', 'vc', array['Lightspeed']),
  ('General Catalyst', 'vc', array['GC']),
  ('Index Ventures', 'vc', array['Index']),
  ('Founders Fund', 'vc', array[]),
  ('Y Combinator', 'accelerator', array['YC']),
  ('Techstars', 'accelerator', array[]),
  ('500 Startups', 'accelerator', array['500 Global']),
  ('First Round Capital', 'vc', array['First Round']),
  ('Union Square Ventures', 'vc', array['USV']),
  ('Bessemer Venture Partners', 'vc', array['Bessemer', 'BVP']),
  ('NEA', 'vc', array['New Enterprise Associates']),
  ('Insight Partners', 'vc', array['Insight']),
  ('Tiger Global', 'vc', array['Tiger Global Management']),
  ('SoftBank Vision Fund', 'vc', array['SoftBank', 'Vision Fund']);

-- Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.work_history enable row level security;
alter table public.email_interactions enable row level security;
alter table public.calendar_interactions enable row level security;

-- Profiles: users can only see/edit their own profile
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Contacts: users can only see/edit their own contacts
create policy "Users can view own contacts" on public.contacts
  for select using (auth.uid() = owner_id);
create policy "Users can insert own contacts" on public.contacts
  for insert with check (auth.uid() = owner_id);
create policy "Users can update own contacts" on public.contacts
  for update using (auth.uid() = owner_id);
create policy "Users can delete own contacts" on public.contacts
  for delete using (auth.uid() = owner_id);

-- Work history: accessible via contact ownership
create policy "Users can view work history of own contacts" on public.work_history
  for select using (
    exists (
      select 1 from public.contacts
      where contacts.id = work_history.contact_id
      and contacts.owner_id = auth.uid()
    )
  );
create policy "Users can insert work history for own contacts" on public.work_history
  for insert with check (
    exists (
      select 1 from public.contacts
      where contacts.id = work_history.contact_id
      and contacts.owner_id = auth.uid()
    )
  );

-- Email interactions: users can only see their own
create policy "Users can view own email interactions" on public.email_interactions
  for select using (auth.uid() = owner_id);
create policy "Users can insert own email interactions" on public.email_interactions
  for insert with check (auth.uid() = owner_id);

-- Calendar interactions: users can only see their own
create policy "Users can view own calendar interactions" on public.calendar_interactions
  for select using (auth.uid() = owner_id);
create policy "Users can insert own calendar interactions" on public.calendar_interactions
  for insert with check (auth.uid() = owner_id);

-- Known firms: everyone can read
create policy "Anyone can view known firms" on public.known_firms
  for select using (true);

-- Functions

-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new user signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Function to update proximity score
create or replace function public.calculate_proximity_score(contact_uuid uuid)
returns integer as $$
declare
  score integer := 0;
  email_count integer;
  meeting_count integer;
  last_email timestamp;
  last_meeting timestamp;
  days_since_interaction integer;
begin
  -- Base score for being a direct contact
  score := score + 20;

  -- Email interactions (max 40 points)
  select count(*), max(email_date)
  into email_count, last_email
  from public.email_interactions
  where contact_id = contact_uuid;

  if email_count > 0 then
    score := score + least(email_count * 5, 40);
  end if;

  -- Calendar meetings (max 30 points)
  select count(*), max(event_start)
  into meeting_count, last_meeting
  from public.calendar_interactions
  where contact_id = contact_uuid;

  if meeting_count > 0 then
    score := score + least(meeting_count * 10, 30);
  end if;

  -- Recency bonus (max 20 points)
  if last_email is not null or last_meeting is not null then
    days_since_interaction := extract(day from now() - greatest(coalesce(last_email, '1970-01-01'::timestamp), coalesce(last_meeting, '1970-01-01'::timestamp)));
    if days_since_interaction < 7 then
      score := score + 20;
    elsif days_since_interaction < 30 then
      score := score + 15;
    elsif days_since_interaction < 90 then
      score := score + 10;
    elsif days_since_interaction < 365 then
      score := score + 5;
    end if;
  end if;

  return least(score, 100);
end;
$$ language plpgsql security definer;

-- Index for performance
create index contacts_owner_id_idx on public.contacts(owner_id);
create index contacts_category_idx on public.contacts(category);
create index contacts_proximity_score_idx on public.contacts(proximity_score desc);
create index work_history_contact_id_idx on public.work_history(contact_id);
create index email_interactions_contact_id_idx on public.email_interactions(contact_id);
create index calendar_interactions_contact_id_idx on public.calendar_interactions(contact_id);
