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
