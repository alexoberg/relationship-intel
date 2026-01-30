-- Fix RLS Infinite Recursion
-- The team_members policies reference team_members table, causing recursion
-- Solution: Use SECURITY DEFINER functions that bypass RLS for membership checks

-- Helper function to check if user is a team member (bypasses RLS)
create or replace function public.is_team_member(check_team_id uuid, check_user_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.team_members
    where team_id = check_team_id
    and user_id = check_user_id
  );
end;
$$ language plpgsql security definer stable;

-- Helper function to check if user is a team admin (bypasses RLS)
create or replace function public.is_team_admin(check_team_id uuid, check_user_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.team_members
    where team_id = check_team_id
    and user_id = check_user_id
    and role = 'admin'
  );
end;
$$ language plpgsql security definer stable;

-- Helper function to get all team_ids a user belongs to (bypasses RLS)
create or replace function public.get_user_team_ids(check_user_id uuid)
returns setof uuid as $$
begin
  return query
    select team_id from public.team_members
    where user_id = check_user_id;
end;
$$ language plpgsql security definer stable;

-- Helper function to check if two users share a team where first is admin
create or replace function public.is_admin_of_user(admin_user_id uuid, member_user_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.team_members tm1
    join public.team_members tm2 on tm1.team_id = tm2.team_id
    where tm1.user_id = admin_user_id
    and tm1.role = 'admin'
    and tm2.user_id = member_user_id
  );
end;
$$ language plpgsql security definer stable;

-- Drop old team_members policies
drop policy if exists "Team members can view team members" on public.team_members;
drop policy if exists "Admins can manage team members" on public.team_members;

-- New team_members policies using helper functions
create policy "Team members can view team members" on public.team_members
  for select using (
    public.is_team_member(team_id, auth.uid())
  );

create policy "Users can insert themselves as members" on public.team_members
  for insert with check (
    user_id = auth.uid()
  );

create policy "Admins can update team members" on public.team_members
  for update using (
    public.is_team_admin(team_id, auth.uid())
  );

create policy "Admins can delete team members" on public.team_members
  for delete using (
    public.is_team_admin(team_id, auth.uid())
    or user_id = auth.uid() -- users can remove themselves
  );

-- Fix teams policies
drop policy if exists "Team members can view their teams" on public.teams;
drop policy if exists "Admins can update teams" on public.teams;

create policy "Team members can view their teams" on public.teams
  for select using (
    public.is_team_member(id, auth.uid())
  );

create policy "Admins can update teams" on public.teams
  for update using (
    public.is_team_admin(id, auth.uid())
  );

-- Fix invites policies
drop policy if exists "Team members can view invites" on public.invites;
drop policy if exists "Admins can create invites" on public.invites;

create policy "Team members can view invites" on public.invites
  for select using (
    public.is_team_member(team_id, auth.uid())
  );

create policy "Admins can create invites" on public.invites
  for insert with check (
    public.is_team_admin(team_id, auth.uid())
  );

-- Fix contacts policy to use helper function
drop policy if exists "Users can view own contacts or team contacts as admin" on public.contacts;
create policy "Users can view own contacts or team contacts as admin" on public.contacts
  for select using (
    auth.uid() = owner_id
    or public.is_admin_of_user(auth.uid(), owner_id)
  );

-- Fix work_history policy
drop policy if exists "Users can view work history of own or team contacts" on public.work_history;
create policy "Users can view work history of own or team contacts" on public.work_history
  for select using (
    exists (
      select 1 from public.contacts
      where contacts.id = work_history.contact_id
      and (
        contacts.owner_id = auth.uid()
        or public.is_admin_of_user(auth.uid(), contacts.owner_id)
      )
    )
  );

-- Fix email_interactions policy
drop policy if exists "Users can view own or team email interactions" on public.email_interactions;
create policy "Users can view own or team email interactions" on public.email_interactions
  for select using (
    auth.uid() = owner_id
    or public.is_admin_of_user(auth.uid(), owner_id)
  );

-- Fix calendar_interactions policy
drop policy if exists "Users can view own or team calendar interactions" on public.calendar_interactions;
create policy "Users can view own or team calendar interactions" on public.calendar_interactions
  for select using (
    auth.uid() = owner_id
    or public.is_admin_of_user(auth.uid(), owner_id)
  );
