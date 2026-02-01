-- ============================================
-- PROSPECTS ARCHITECTURE
-- ============================================
-- New schema for Helix sales prospecting
-- Uses The Swarm for relationship graph, Supabase for app data
-- ============================================

-- Target companies for Helix sales
CREATE TABLE public.prospects (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  
  -- Company info
  company_name text NOT NULL,
  company_domain text NOT NULL,
  company_industry text,
  company_size text,
  company_linkedin_url text,
  company_website text,
  company_description text,
  
  -- Funding info (for prioritization)
  funding_stage text, -- seed, series_a, series_b, etc.
  last_funding_date date,
  last_funding_amount numeric,
  total_funding numeric,
  investors text[], -- Array of investor names
  
  -- Helix fit scoring (from helix-sales.ts)
  helix_products text[] DEFAULT '{}', -- captcha_replacement, voice_captcha, age_verification
  helix_fit_score integer DEFAULT 0, -- 0-100
  helix_fit_reason text,
  helix_target_titles text[] DEFAULT '{}', -- CISO, GC, Trust & Safety, etc.
  
  -- Connection scoring (from The Swarm)
  connection_score integer DEFAULT 0, -- 0-100
  has_warm_intro boolean DEFAULT false,
  best_connector text, -- Name of team member with best connection
  connection_type text, -- work_history, education, linkedin, etc.
  connection_context text, -- "Worked together at Ticketmaster (2018-2020)"
  connections_count integer DEFAULT 0,
  last_swarm_sync timestamp with time zone,
  
  -- Combined priority score
  priority_score integer GENERATED ALWAYS AS (
    (helix_fit_score * 0.4 + connection_score * 0.6)::integer
  ) STORED,
  
  -- Status tracking
  status text DEFAULT 'new' CHECK (status IN ('new', 'researching', 'reaching_out', 'in_conversation', 'won', 'lost', 'not_a_fit')),
  status_changed_at timestamp with time zone DEFAULT now(),
  
  -- Feedback
  is_good_fit boolean, -- Manual override
  feedback_notes text,
  feedback_by uuid REFERENCES public.profiles(id),
  feedback_at timestamp with time zone,
  
  -- Source tracking
  source text DEFAULT 'manual', -- manual, av100, research, import
  source_url text,
  
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  
  -- Prevent duplicates per team
  UNIQUE(team_id, company_domain)
);

-- Cached connection paths from The Swarm
CREATE TABLE public.prospect_connections (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  prospect_id uuid REFERENCES public.prospects(id) ON DELETE CASCADE NOT NULL,
  
  -- Target person at the company
  target_name text NOT NULL,
  target_title text,
  target_linkedin_url text,
  target_email text,
  
  -- Connection path
  connector_user_id uuid REFERENCES public.profiles(id),
  connector_name text NOT NULL,
  connection_type text NOT NULL, -- work_history, education, linkedin, email, calendar
  connection_strength numeric DEFAULT 0, -- 0-1 from Swarm
  shared_context text, -- "Worked together at X (2018-2020)"
  
  -- Swarm metadata
  swarm_profile_id text,
  
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  
  -- Prevent duplicate paths
  UNIQUE(prospect_id, target_linkedin_url, connector_user_id)
);

-- Prospect interaction history
CREATE TABLE public.prospect_activities (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  prospect_id uuid REFERENCES public.prospects(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  
  activity_type text NOT NULL CHECK (activity_type IN (
    'status_change', 'note_added', 'feedback_given', 
    'email_sent', 'meeting_scheduled', 'connection_requested',
    'swarm_synced', 'enriched'
  )),
  
  activity_data jsonb DEFAULT '{}',
  notes text,
  
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Target company lists (for organizing prospects)
CREATE TABLE public.prospect_lists (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  
  name text NOT NULL,
  description text,
  
  -- Filter criteria (stored as JSON for flexibility)
  filters jsonb DEFAULT '{}',
  -- e.g., {"helix_products": ["voice_captcha"], "funding_stage": ["seed", "series_a"], "min_connection_score": 50}
  
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Junction table for lists
CREATE TABLE public.prospect_list_items (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  list_id uuid REFERENCES public.prospect_lists(id) ON DELETE CASCADE NOT NULL,
  prospect_id uuid REFERENCES public.prospects(id) ON DELETE CASCADE NOT NULL,
  
  added_by uuid REFERENCES public.profiles(id),
  added_at timestamp with time zone DEFAULT now() NOT NULL,
  
  UNIQUE(list_id, prospect_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX prospects_team_id_idx ON public.prospects(team_id);
CREATE INDEX prospects_priority_score_idx ON public.prospects(priority_score DESC);
CREATE INDEX prospects_helix_fit_score_idx ON public.prospects(helix_fit_score DESC);
CREATE INDEX prospects_connection_score_idx ON public.prospects(connection_score DESC);
CREATE INDEX prospects_status_idx ON public.prospects(status);
CREATE INDEX prospects_funding_stage_idx ON public.prospects(funding_stage);
CREATE INDEX prospects_helix_products_idx ON public.prospects USING GIN(helix_products);

CREATE INDEX prospect_connections_prospect_id_idx ON public.prospect_connections(prospect_id);
CREATE INDEX prospect_connections_connector_idx ON public.prospect_connections(connector_user_id);

CREATE INDEX prospect_activities_prospect_id_idx ON public.prospect_activities(prospect_id);
CREATE INDEX prospect_activities_created_at_idx ON public.prospect_activities(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_list_items ENABLE ROW LEVEL SECURITY;

-- Prospects: team members can view/edit
CREATE POLICY "Team members can view prospects" ON public.prospects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = prospects.team_id
      AND team_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Team members can insert prospects" ON public.prospects
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = prospects.team_id
      AND team_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Team members can update prospects" ON public.prospects
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = prospects.team_id
      AND team_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Team admins can delete prospects" ON public.prospects
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = prospects.team_id
      AND team_members.user_id = auth.uid()
      AND team_members.role = 'admin'
    )
  );

-- Prospect connections: same as prospects
CREATE POLICY "Team members can view prospect connections" ON public.prospect_connections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.prospects p
      JOIN public.team_members tm ON tm.team_id = p.team_id
      WHERE p.id = prospect_connections.prospect_id
      AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Team members can insert prospect connections" ON public.prospect_connections
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.prospects p
      JOIN public.team_members tm ON tm.team_id = p.team_id
      WHERE p.id = prospect_connections.prospect_id
      AND tm.user_id = auth.uid()
    )
  );

-- Activities: team members can view/insert
CREATE POLICY "Team members can view activities" ON public.prospect_activities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.prospects p
      JOIN public.team_members tm ON tm.team_id = p.team_id
      WHERE p.id = prospect_activities.prospect_id
      AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Team members can insert activities" ON public.prospect_activities
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Lists: team access
CREATE POLICY "Team members can manage lists" ON public.prospect_lists
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = prospect_lists.team_id
      AND team_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Team members can manage list items" ON public.prospect_list_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.prospect_lists pl
      JOIN public.team_members tm ON tm.team_id = pl.team_id
      WHERE pl.id = prospect_list_items.list_id
      AND tm.user_id = auth.uid()
    )
  );

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update prospect timestamps
CREATE OR REPLACE FUNCTION public.update_prospect_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prospects_updated_at
  BEFORE UPDATE ON public.prospects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_prospect_timestamp();

-- Function to log prospect activities
CREATE OR REPLACE FUNCTION public.log_prospect_activity(
  p_prospect_id uuid,
  p_user_id uuid,
  p_activity_type text,
  p_activity_data jsonb DEFAULT '{}',
  p_notes text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  activity_id uuid;
BEGIN
  INSERT INTO public.prospect_activities (prospect_id, user_id, activity_type, activity_data, notes)
  VALUES (p_prospect_id, p_user_id, p_activity_type, p_activity_data, p_notes)
  RETURNING id INTO activity_id;
  
  RETURN activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Swarm Contact Support Migration
-- Adds support for ingesting contacts from The Swarm network

-- 1. Update contacts source constraint to allow 'swarm'
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_source_check
  CHECK (source IN ('linkedin_csv', 'gmail', 'gcal', 'manual', 'swarm'));

-- 2. Add team_id to contacts (for team-based access)
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE;

-- 3. Add Swarm-specific columns to contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS swarm_profile_id text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS company_domain text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS swarm_synced_at timestamp with time zone;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS pdl_enriched_at timestamp with time zone;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS connection_strength float;

-- 4. Create unique constraint for swarm_profile_id per team
CREATE UNIQUE INDEX IF NOT EXISTS contacts_team_swarm_profile_idx
  ON public.contacts (team_id, swarm_profile_id)
  WHERE swarm_profile_id IS NOT NULL;

-- 5. Create contact_connections table (stores who knows each contact and how)
CREATE TABLE IF NOT EXISTS public.contact_connections (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE NOT NULL,
  connector_name text NOT NULL,
  connector_linkedin_url text,
  connection_strength float DEFAULT 0,
  connection_sources jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  UNIQUE(contact_id, connector_name)
);

-- 6. Enable RLS on contact_connections
ALTER TABLE public.contact_connections ENABLE ROW LEVEL SECURITY;

-- 7. RLS policies for contact_connections
CREATE POLICY "Users can view contact connections for their contacts" ON public.contact_connections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = contact_connections.contact_id
      AND (
        c.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.user_id = auth.uid()
          AND tm.team_id = c.team_id
        )
      )
    )
  );

-- 8. Update prospect_connections to support contact_id reference
ALTER TABLE public.prospect_connections ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

-- 9. Create index for faster contact lookups by domain
CREATE INDEX IF NOT EXISTS contacts_company_domain_idx ON public.contacts (company_domain);
CREATE INDEX IF NOT EXISTS contacts_team_id_idx ON public.contacts (team_id);
CREATE INDEX IF NOT EXISTS contacts_swarm_synced_at_idx ON public.contacts (swarm_synced_at);
CREATE INDEX IF NOT EXISTS contacts_pdl_enriched_at_idx ON public.contacts (pdl_enriched_at);

-- 10. Update RLS for contacts to support team access
DROP POLICY IF EXISTS "Users can view own contacts" ON public.contacts;
CREATE POLICY "Users can view contacts" ON public.contacts
  FOR SELECT USING (
    owner_id = auth.uid()
    OR (
      team_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.user_id = auth.uid()
        AND tm.team_id = contacts.team_id
      )
    )
  );

-- 11. Function to find duplicate contacts by email
CREATE OR REPLACE FUNCTION find_duplicate_contacts_by_email(p_team_id uuid)
RETURNS TABLE (
  email text,
  duplicate_ids uuid[],
  duplicate_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.email,
    array_agg(c.id ORDER BY c.connection_strength DESC NULLS LAST, c.created_at ASC) as duplicate_ids,
    count(*) as duplicate_count
  FROM public.contacts c
  WHERE c.team_id = p_team_id
    AND c.email IS NOT NULL
    AND c.email != ''
  GROUP BY c.email
  HAVING count(*) > 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Function to find duplicate contacts by LinkedIn URL
CREATE OR REPLACE FUNCTION find_duplicate_contacts_by_linkedin(p_team_id uuid)
RETURNS TABLE (
  linkedin_url text,
  duplicate_ids uuid[],
  duplicate_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.linkedin_url,
    array_agg(c.id ORDER BY c.connection_strength DESC NULLS LAST, c.created_at ASC) as duplicate_ids,
    count(*) as duplicate_count
  FROM public.contacts c
  WHERE c.team_id = p_team_id
    AND c.linkedin_url IS NOT NULL
    AND c.linkedin_url != ''
  GROUP BY c.linkedin_url
  HAVING count(*) > 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Job History & Multi-Source Contact Support Migration
-- Enables PDL enrichment with historical job data

-- 1. Add job_history to contacts (stores all positions from PDL)
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS job_history jsonb DEFAULT '[]'::jsonb;
-- Format: [{ "company": "Roblox", "domain": "roblox.com", "title": "PM", "start_date": "2020-01", "end_date": "2023-06", "is_current": false }]

-- 2. Add source tracking for multi-source contacts
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_source_check
  CHECK (source IN ('linkedin_csv', 'gmail', 'gcal', 'manual', 'swarm', 'apollo', 'salesforce', 'hubspot'));

-- 3. Add enrichment status columns
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS enrichment_status text DEFAULT 'pending';
ALTER TABLE public.contacts ADD CONSTRAINT contacts_enrichment_status_check
  CHECK (enrichment_status IN ('pending', 'enriching', 'enriched', 'failed', 'skipped'));

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS enrichment_error text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_enrichment_attempt timestamp with time zone;

-- 4. Add normalized company fields for better matching
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS current_company_normalized text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS current_title_normalized text;

-- 5. Create index for job history searching (GIN index for JSONB)
CREATE INDEX IF NOT EXISTS contacts_job_history_idx ON public.contacts USING GIN (job_history);

-- 6. Create index for enrichment status
CREATE INDEX IF NOT EXISTS contacts_enrichment_status_idx ON public.contacts (enrichment_status) WHERE enrichment_status != 'enriched';

-- 7. Create function to find contacts by company (current OR historical)
CREATE OR REPLACE FUNCTION find_contacts_by_company(p_team_id uuid, p_company_domain text)
RETURNS TABLE (
  contact_id uuid,
  contact_name text,
  contact_email text,
  contact_linkedin_url text,
  connection_strength float,
  is_current_employee boolean,
  job_title text,
  job_start_date text,
  job_end_date text
) AS $$
BEGIN
  RETURN QUERY
  -- Current employees (matching company_domain)
  SELECT 
    c.id as contact_id,
    c.name as contact_name,
    c.email as contact_email,
    c.linkedin_url as contact_linkedin_url,
    c.connection_strength,
    true as is_current_employee,
    c.title as job_title,
    null::text as job_start_date,
    null::text as job_end_date
  FROM public.contacts c
  WHERE c.team_id = p_team_id
    AND c.company_domain = p_company_domain
  
  UNION ALL
  
  -- Former employees (from job_history)
  SELECT 
    c.id as contact_id,
    c.name as contact_name,
    c.email as contact_email,
    c.linkedin_url as contact_linkedin_url,
    c.connection_strength,
    false as is_current_employee,
    (job->>'title')::text as job_title,
    (job->>'start_date')::text as job_start_date,
    (job->>'end_date')::text as job_end_date
  FROM public.contacts c,
       jsonb_array_elements(c.job_history) as job
  WHERE c.team_id = p_team_id
    AND (job->>'domain' = p_company_domain OR job->>'company' ILIKE '%' || split_part(p_company_domain, '.', 1) || '%')
    AND (job->>'is_current')::boolean = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Create function to get enrichment queue
CREATE OR REPLACE FUNCTION get_contacts_for_enrichment(p_team_id uuid, p_limit int DEFAULT 100)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  linkedin_url text,
  company_domain text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.email,
    c.linkedin_url,
    c.company_domain
  FROM public.contacts c
  WHERE c.team_id = p_team_id
    AND c.enrichment_status = 'pending'
    AND (c.email IS NOT NULL OR c.linkedin_url IS NOT NULL)
  ORDER BY c.connection_strength DESC NULLS LAST, c.created_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Add trigger to auto-normalize company names on insert/update
CREATE OR REPLACE FUNCTION normalize_contact_company()
RETURNS TRIGGER AS $$
BEGIN
  -- Normalize company domain (lowercase, remove www.)
  IF NEW.company_domain IS NOT NULL THEN
    NEW.company_domain := lower(regexp_replace(NEW.company_domain, '^www\.', ''));
  END IF;
  
  -- Normalize current company name
  IF NEW.company IS NOT NULL THEN
    NEW.current_company_normalized := lower(trim(NEW.company));
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS normalize_contact_company_trigger ON public.contacts;
CREATE TRIGGER normalize_contact_company_trigger
  BEFORE INSERT OR UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION normalize_contact_company();
