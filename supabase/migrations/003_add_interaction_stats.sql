-- Add interaction stats fields to contacts table
-- These store aggregated counts for fast display without joins

-- Add new columns
alter table public.contacts
  add column if not exists linkedin_connected_on date,
  add column if not exists email_count integer default 0,
  add column if not exists meeting_count integer default 0,
  add column if not exists first_interaction_at timestamp with time zone,
  add column if not exists last_email_at timestamp with time zone,
  add column if not exists last_meeting_at timestamp with time zone;

-- Create function to recalculate all stats for a contact
create or replace function public.recalculate_contact_stats(contact_uuid uuid)
returns void as $$
declare
  e_count integer;
  m_count integer;
  first_email timestamp with time zone;
  last_email timestamp with time zone;
  first_meeting timestamp with time zone;
  last_meeting timestamp with time zone;
  first_int timestamp with time zone;
  last_int timestamp with time zone;
  new_score integer;
begin
  -- Get email stats
  select count(*), min(email_date), max(email_date)
  into e_count, first_email, last_email
  from public.email_interactions
  where contact_id = contact_uuid;

  -- Get meeting stats
  select count(*), min(event_start), max(event_start)
  into m_count, first_meeting, last_meeting
  from public.calendar_interactions
  where contact_id = contact_uuid;

  -- Calculate first/last interaction
  first_int := least(coalesce(first_email, 'infinity'::timestamp), coalesce(first_meeting, 'infinity'::timestamp));
  if first_int = 'infinity'::timestamp then first_int := null; end if;

  last_int := greatest(coalesce(last_email, '-infinity'::timestamp), coalesce(last_meeting, '-infinity'::timestamp));
  if last_int = '-infinity'::timestamp then last_int := null; end if;

  -- Calculate proximity score
  new_score := public.calculate_proximity_score(contact_uuid);

  -- Update the contact
  update public.contacts
  set
    email_count = coalesce(e_count, 0),
    meeting_count = coalesce(m_count, 0),
    first_interaction_at = first_int,
    last_interaction_at = last_int,
    last_email_at = last_email,
    last_meeting_at = last_meeting,
    interaction_count = coalesce(e_count, 0) + coalesce(m_count, 0),
    proximity_score = new_score,
    updated_at = now()
  where id = contact_uuid;
end;
$$ language plpgsql security definer;

-- Create function to recalculate stats for all contacts of a user
create or replace function public.recalculate_all_user_stats(user_uuid uuid)
returns integer as $$
declare
  contact_record record;
  updated_count integer := 0;
begin
  for contact_record in
    select id from public.contacts where owner_id = user_uuid
  loop
    perform public.recalculate_contact_stats(contact_record.id);
    updated_count := updated_count + 1;
  end loop;

  return updated_count;
end;
$$ language plpgsql security definer;

-- Create index for the new columns
create index if not exists contacts_email_count_idx on public.contacts(email_count desc);
create index if not exists contacts_meeting_count_idx on public.contacts(meeting_count desc);
create index if not exists contacts_linkedin_connected_on_idx on public.contacts(linkedin_connected_on);
