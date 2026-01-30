-- Team Sharing Migration
-- Adds support for team networks where an admin can see all members' data

-- Teams table
create table public.teams (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  created_by uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Team members with roles
create table public.team_members (
  id uuid default uuid_generate_v4() primary key,
  team_id uuid references public.teams(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text check (role in ('admin', 'member')) not null default 'member',
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,

  unique(team_id, user_id)
);

-- Invite links
create table public.invites (
  id uuid default uuid_generate_v4() primary key,
  team_id uuid references public.teams(id) on delete cascade not null,
  code text unique not null default encode(gen_random_bytes(16), 'hex'),
  created_by uuid references public.profiles(id) on delete cascade not null,
  expires_at timestamp with time zone default (now() + interval '7 days'),
  max_uses integer default null, -- null = unlimited
  use_count integer default 0,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Multiple Google accounts per user
create table public.google_accounts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  email text not null,
  access_token text,
  refresh_token text,
  token_expiry timestamp with time zone,
  is_primary boolean default false,
  last_sync_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,

  unique(user_id, email)
);

-- Enable RLS on new tables
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.invites enable row level security;
alter table public.google_accounts enable row level security;

-- Teams: visible to members
create policy "Team members can view their teams" on public.teams
  for select using (
    exists (
      select 1 from public.team_members
      where team_members.team_id = teams.id
      and team_members.user_id = auth.uid()
    )
  );

create policy "Users can create teams" on public.teams
  for insert with check (auth.uid() = created_by);

create policy "Admins can update teams" on public.teams
  for update using (
    exists (
      select 1 from public.team_members
      where team_members.team_id = teams.id
      and team_members.user_id = auth.uid()
      and team_members.role = 'admin'
    )
  );

-- Team members: visible to other members
create policy "Team members can view team members" on public.team_members
  for select using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = team_members.team_id
      and tm.user_id = auth.uid()
    )
  );

create policy "Admins can manage team members" on public.team_members
  for all using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = team_members.team_id
      and tm.user_id = auth.uid()
      and tm.role = 'admin'
    )
  );

-- Invites: admins can manage
create policy "Team members can view invites" on public.invites
  for select using (
    exists (
      select 1 from public.team_members
      where team_members.team_id = invites.team_id
      and team_members.user_id = auth.uid()
    )
  );

create policy "Admins can create invites" on public.invites
  for insert with check (
    exists (
      select 1 from public.team_members
      where team_members.team_id = invites.team_id
      and team_members.user_id = auth.uid()
      and team_members.role = 'admin'
    )
  );

-- Google accounts: users can manage their own
create policy "Users can view own google accounts" on public.google_accounts
  for select using (auth.uid() = user_id);

create policy "Users can manage own google accounts" on public.google_accounts
  for all using (auth.uid() = user_id);

-- Update contacts RLS to allow admin access
drop policy if exists "Users can view own contacts" on public.contacts;
create policy "Users can view own contacts or team contacts as admin" on public.contacts
  for select using (
    auth.uid() = owner_id
    or exists (
      select 1 from public.team_members tm1
      join public.team_members tm2 on tm1.team_id = tm2.team_id
      where tm1.user_id = auth.uid()
      and tm1.role = 'admin'
      and tm2.user_id = contacts.owner_id
    )
  );

-- Update work_history RLS for admin access
drop policy if exists "Users can view work history of own contacts" on public.work_history;
create policy "Users can view work history of own or team contacts" on public.work_history
  for select using (
    exists (
      select 1 from public.contacts
      where contacts.id = work_history.contact_id
      and (
        contacts.owner_id = auth.uid()
        or exists (
          select 1 from public.team_members tm1
          join public.team_members tm2 on tm1.team_id = tm2.team_id
          where tm1.user_id = auth.uid()
          and tm1.role = 'admin'
          and tm2.user_id = contacts.owner_id
        )
      )
    )
  );

-- Update email_interactions RLS for admin access
drop policy if exists "Users can view own email interactions" on public.email_interactions;
create policy "Users can view own or team email interactions" on public.email_interactions
  for select using (
    auth.uid() = owner_id
    or exists (
      select 1 from public.team_members tm1
      join public.team_members tm2 on tm1.team_id = tm2.team_id
      where tm1.user_id = auth.uid()
      and tm1.role = 'admin'
      and tm2.user_id = email_interactions.owner_id
    )
  );

-- Update calendar_interactions RLS for admin access
drop policy if exists "Users can view own calendar interactions" on public.calendar_interactions;
create policy "Users can view own or team calendar interactions" on public.calendar_interactions
  for select using (
    auth.uid() = owner_id
    or exists (
      select 1 from public.team_members tm1
      join public.team_members tm2 on tm1.team_id = tm2.team_id
      where tm1.user_id = auth.uid()
      and tm1.role = 'admin'
      and tm2.user_id = calendar_interactions.owner_id
    )
  );

-- Indexes for performance
create index team_members_team_id_idx on public.team_members(team_id);
create index team_members_user_id_idx on public.team_members(user_id);
create index invites_code_idx on public.invites(code);
create index invites_team_id_idx on public.invites(team_id);
create index google_accounts_user_id_idx on public.google_accounts(user_id);

-- Function to join team via invite code
create or replace function public.join_team_via_invite(invite_code text)
returns json as $$
declare
  invite_record record;
  team_record record;
begin
  -- Get valid invite
  select * into invite_record
  from public.invites
  where code = invite_code
  and is_active = true
  and (expires_at is null or expires_at > now())
  and (max_uses is null or use_count < max_uses);

  if not found then
    return json_build_object('success', false, 'error', 'Invalid or expired invite');
  end if;

  -- Check if already a member
  if exists (
    select 1 from public.team_members
    where team_id = invite_record.team_id
    and user_id = auth.uid()
  ) then
    return json_build_object('success', false, 'error', 'Already a team member');
  end if;

  -- Add as member
  insert into public.team_members (team_id, user_id, role)
  values (invite_record.team_id, auth.uid(), 'member');

  -- Increment use count
  update public.invites
  set use_count = use_count + 1
  where id = invite_record.id;

  -- Get team info
  select * into team_record from public.teams where id = invite_record.team_id;

  return json_build_object(
    'success', true,
    'team_id', team_record.id,
    'team_name', team_record.name
  );
end;
$$ language plpgsql security definer;
