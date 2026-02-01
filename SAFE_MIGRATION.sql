-- ============================================
-- SAFE MIGRATION - Only adds what's missing
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. FIX PROSPECTS TABLE COLUMNS
-- ============================================
DO $$
BEGIN
  -- Rename 'name' to 'company_name' if it exists
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='name') THEN
    ALTER TABLE public.prospects RENAME COLUMN name TO company_name;
  END IF;
END $$;

-- Add missing columns
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS company_industry text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS company_size text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS company_linkedin_url text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS company_website text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS company_description text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS funding_stage text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS last_funding_date date;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS last_funding_amount numeric;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS total_funding numeric;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS investors text[];
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS helix_products text[] DEFAULT '{}';
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS helix_fit_score integer DEFAULT 0;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS helix_fit_reason text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS helix_target_titles text[] DEFAULT '{}';
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS connection_score integer DEFAULT 0;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS has_warm_intro boolean DEFAULT false;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS best_connector text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS connection_type text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS connection_context text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS connections_count integer DEFAULT 0;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS last_swarm_sync timestamp with time zone;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS status text DEFAULT 'new';
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS status_changed_at timestamp with time zone DEFAULT now();
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS is_good_fit boolean;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS feedback_notes text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS feedback_by uuid;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS feedback_at timestamp with time zone;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS source_url text;

-- 2. CREATE PROSPECT_CONNECTIONS TABLE IF NOT EXISTS
-- ============================================
CREATE TABLE IF NOT EXISTS public.prospect_connections (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  prospect_id uuid REFERENCES public.prospects(id) ON DELETE CASCADE NOT NULL,
  target_name text NOT NULL,
  target_title text,
  target_linkedin_url text,
  target_email text,
  connector_user_id uuid REFERENCES public.profiles(id),
  connector_name text NOT NULL,
  connection_type text NOT NULL,
  connection_strength numeric DEFAULT 0,
  shared_context text,
  swarm_profile_id text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 3. CREATE PROSPECT_ACTIVITIES TABLE IF NOT EXISTS
-- ============================================
CREATE TABLE IF NOT EXISTS public.prospect_activities (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  prospect_id uuid REFERENCES public.prospects(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  activity_type text NOT NULL,
  activity_data jsonb DEFAULT '{}',
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 4. CREATE PROSPECT_LISTS TABLE IF NOT EXISTS
-- ============================================
CREATE TABLE IF NOT EXISTS public.prospect_lists (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  filters jsonb DEFAULT '{}',
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.prospect_list_items (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  list_id uuid REFERENCES public.prospect_lists(id) ON DELETE CASCADE NOT NULL,
  prospect_id uuid REFERENCES public.prospects(id) ON DELETE CASCADE NOT NULL,
  added_by uuid REFERENCES public.profiles(id),
  added_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 5. SWARM CONTACT SUPPORT
-- ============================================
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS swarm_profile_id text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS connection_strength numeric DEFAULT 0;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS relationship_source text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS pdl_enriched_at timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.contact_connections (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE NOT NULL,
  connected_via_user_id uuid REFERENCES public.profiles(id),
  connection_type text NOT NULL,
  connection_strength numeric DEFAULT 0,
  shared_context text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 6. JOB HISTORY SUPPORT
-- ============================================
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS company_domain text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS job_title text;

CREATE TABLE IF NOT EXISTS public.contact_job_history (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE NOT NULL,
  company_name text NOT NULL,
  company_domain text,
  job_title text,
  start_date date,
  end_date date,
  is_current boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 7. CREATE INDEXES (IF NOT EXISTS)
-- ============================================
CREATE INDEX IF NOT EXISTS prospects_team_id_idx ON public.prospects(team_id);
CREATE INDEX IF NOT EXISTS prospects_status_idx ON public.prospects(status);
CREATE INDEX IF NOT EXISTS prospects_funding_stage_idx ON public.prospects(funding_stage);
CREATE INDEX IF NOT EXISTS prospect_connections_prospect_id_idx ON public.prospect_connections(prospect_id);
CREATE INDEX IF NOT EXISTS prospect_activities_prospect_id_idx ON public.prospect_activities(prospect_id);
CREATE INDEX IF NOT EXISTS contacts_team_id_idx ON public.contacts(team_id);
CREATE INDEX IF NOT EXISTS contacts_company_domain_idx ON public.contacts(company_domain);
CREATE INDEX IF NOT EXISTS contact_connections_contact_id_idx ON public.contact_connections(contact_id);
CREATE INDEX IF NOT EXISTS contact_job_history_contact_id_idx ON public.contact_job_history(contact_id);
CREATE INDEX IF NOT EXISTS contact_job_history_company_domain_idx ON public.contact_job_history(company_domain);

-- 8. ENABLE RLS ON NEW TABLES
-- ============================================
ALTER TABLE public.prospect_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_job_history ENABLE ROW LEVEL SECURITY;

-- 9. RLS POLICIES (drop if exists, then create)
-- ============================================
DROP POLICY IF EXISTS "Team members can view prospect connections" ON public.prospect_connections;
CREATE POLICY "Team members can view prospect connections" ON public.prospect_connections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.prospects p
      JOIN public.team_members tm ON tm.team_id = p.team_id
      WHERE p.id = prospect_connections.prospect_id
      AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Team members can insert prospect connections" ON public.prospect_connections;
CREATE POLICY "Team members can insert prospect connections" ON public.prospect_connections
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.prospects p
      JOIN public.team_members tm ON tm.team_id = p.team_id
      WHERE p.id = prospect_connections.prospect_id
      AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Team members can view activities" ON public.prospect_activities;
CREATE POLICY "Team members can view activities" ON public.prospect_activities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.prospects p
      JOIN public.team_members tm ON tm.team_id = p.team_id
      WHERE p.id = prospect_activities.prospect_id
      AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Team members can insert activities" ON public.prospect_activities;
CREATE POLICY "Team members can insert activities" ON public.prospect_activities
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Team members can manage lists" ON public.prospect_lists;
CREATE POLICY "Team members can manage lists" ON public.prospect_lists
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = prospect_lists.team_id
      AND team_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Team members can manage list items" ON public.prospect_list_items;
CREATE POLICY "Team members can manage list items" ON public.prospect_list_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.prospect_lists pl
      JOIN public.team_members tm ON tm.team_id = pl.team_id
      WHERE pl.id = prospect_list_items.list_id
      AND tm.user_id = auth.uid()
    )
  );

-- 10. HELPER FUNCTION FOR LOGGING
-- ============================================
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
  VALUES (p_prospect_id, COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::uuid), p_activity_type, p_activity_data, p_notes)
  RETURNING id INTO activity_id;
  RETURN activity_id;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Done!
SELECT 'Migration completed successfully!' as status;
