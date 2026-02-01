-- Alter existing prospects table to match new schema
-- First, rename old columns if they exist
DO $$ 
BEGIN
  -- Rename 'name' to 'company_name' if it exists
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='name') THEN
    ALTER TABLE public.prospects RENAME COLUMN name TO company_name;
  END IF;
  
  -- Rename 'domain' to 'company_domain' if it exists  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='domain') THEN
    ALTER TABLE public.prospects RENAME COLUMN domain TO company_domain;
  END IF;
END $$;

-- Add missing columns if they don't exist
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS company_industry text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS company_size text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS company_linkedin_url text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS company_website text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS company_description text;

-- Funding info
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS funding_stage text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS last_funding_date date;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS last_funding_amount numeric;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS total_funding numeric;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS investors text[];

-- Helix fit scoring
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS helix_products text[] DEFAULT '{}';
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS helix_fit_score integer DEFAULT 0;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS helix_fit_reason text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS helix_target_titles text[] DEFAULT '{}';

-- Connection scoring
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS connection_score integer DEFAULT 0;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS has_warm_intro boolean DEFAULT false;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS best_connector text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS connection_type text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS connection_context text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS connections_count integer DEFAULT 0;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS last_swarm_sync timestamp with time zone;

-- Status tracking
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS status text DEFAULT 'new';
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS status_changed_at timestamp with time zone DEFAULT now();

-- Feedback
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS is_good_fit boolean;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS feedback_notes text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS feedback_by uuid;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS feedback_at timestamp with time zone;

-- Source tracking
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS source_url text;

-- Add unique constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prospects_team_id_company_domain_key') THEN
    ALTER TABLE public.prospects ADD CONSTRAINT prospects_team_id_company_domain_key UNIQUE(team_id, company_domain);
  END IF;
EXCEPTION WHEN others THEN
  NULL; -- Ignore if constraint already exists
END $$;
