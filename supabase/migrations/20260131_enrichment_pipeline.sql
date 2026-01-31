-- ============================================
-- ENRICHMENT PIPELINE SCHEMA
-- Adds budget tracking, work history normalization, and enrichment priority
-- ============================================

-- 1. ENRICHMENT BUDGET TRACKING
-- Track PDL spend per user with $500 pre-authorized, then $50 increments
CREATE TABLE IF NOT EXISTS enrichment_budget (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Budget settings
  authorized_amount DECIMAL(10,2) NOT NULL DEFAULT 500.00,  -- Pre-authorized spend
  increment_amount DECIMAL(10,2) NOT NULL DEFAULT 50.00,    -- Ask approval in this increment

  -- Spend tracking
  total_spent DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  enrichments_count INTEGER NOT NULL DEFAULT 0,
  last_enrichment_at TIMESTAMPTZ,

  -- Approval tracking
  pending_approval BOOLEAN NOT NULL DEFAULT false,
  pending_approval_amount DECIMAL(10,2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id)
);

-- 2. ENRICHMENT LOG
-- Track each enrichment for cost accounting and debugging
CREATE TABLE IF NOT EXISTS enrichment_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,

  -- PDL response tracking
  pdl_id VARCHAR(255),
  pdl_status INTEGER,
  pdl_likelihood INTEGER,  -- PDL returns match confidence

  -- Cost tracking
  cost_usd DECIMAL(6,4) NOT NULL DEFAULT 0.05,  -- Cost per enrichment

  -- Source tracking
  source VARCHAR(50) NOT NULL,  -- 'pdl', 'clearbit', 'manual'

  -- Result
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. ADD NORMALIZATION FIELDS TO WORK_HISTORY
-- If work_history exists, add normalization columns
DO $$
BEGIN
  -- Add normalized company name
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_history' AND column_name = 'company_normalized') THEN
    ALTER TABLE work_history ADD COLUMN company_normalized VARCHAR(255);
  END IF;

  -- Add normalized title
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_history' AND column_name = 'title_normalized') THEN
    ALTER TABLE work_history ADD COLUMN title_normalized VARCHAR(255);
  END IF;

  -- Add role category (Engineering, Sales, Product, Executive, etc.)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_history' AND column_name = 'role_category') THEN
    ALTER TABLE work_history ADD COLUMN role_category VARCHAR(50);
  END IF;

  -- Add seniority level (C-Suite, VP, Director, Manager, Senior, Mid, Junior)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_history' AND column_name = 'seniority_level') THEN
    ALTER TABLE work_history ADD COLUMN seniority_level VARCHAR(50);
  END IF;

  -- Add company domain for matching
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_history' AND column_name = 'company_domain') THEN
    ALTER TABLE work_history ADD COLUMN company_domain VARCHAR(255);
  END IF;
END $$;

-- 4. ADD ENRICHMENT PRIORITY FIELDS TO CONTACTS
DO $$
BEGIN
  -- Enrichment priority score (higher = enrich first)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'enrichment_priority') THEN
    ALTER TABLE contacts ADD COLUMN enrichment_priority INTEGER NOT NULL DEFAULT 0;
  END IF;

  -- Is this a marketing/automated contact?
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'is_marketing_contact') THEN
    ALTER TABLE contacts ADD COLUMN is_marketing_contact BOOLEAN NOT NULL DEFAULT false;
  END IF;

  -- Two-way communication flag (have they replied?)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'has_two_way_communication') THEN
    ALTER TABLE contacts ADD COLUMN has_two_way_communication BOOLEAN NOT NULL DEFAULT false;
  END IF;

  -- Inbound vs outbound email counts
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'inbound_email_count') THEN
    ALTER TABLE contacts ADD COLUMN inbound_email_count INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'outbound_email_count') THEN
    ALTER TABLE contacts ADD COLUMN outbound_email_count INTEGER NOT NULL DEFAULT 0;
  END IF;

  -- Meeting count
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'meeting_count') THEN
    ALTER TABLE contacts ADD COLUMN meeting_count INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 5. ENHANCE KNOWN_FIRMS FOR BETTER COMPANY NORMALIZATION
DO $$
BEGIN
  -- Add domain for matching
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'known_firms' AND column_name = 'domain') THEN
    ALTER TABLE known_firms ADD COLUMN domain VARCHAR(255);
  END IF;

  -- Add industry
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'known_firms' AND column_name = 'industry') THEN
    ALTER TABLE known_firms ADD COLUMN industry VARCHAR(100);
  END IF;

  -- Add company size
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'known_firms' AND column_name = 'company_size') THEN
    ALTER TABLE known_firms ADD COLUMN company_size VARCHAR(50);
  END IF;

  -- Add LinkedIn URL
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'known_firms' AND column_name = 'linkedin_url') THEN
    ALTER TABLE known_firms ADD COLUMN linkedin_url VARCHAR(500);
  END IF;
END $$;

-- 6. ROLE CATEGORIES LOOKUP TABLE
-- Standardized role categories for searchability
CREATE TABLE IF NOT EXISTS role_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,  -- 'Engineering', 'Sales', 'Product', etc.
  keywords TEXT[] NOT NULL DEFAULT '{}',  -- Keywords that map to this category
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default role categories
INSERT INTO role_categories (name, keywords) VALUES
  ('Engineering', ARRAY['engineer', 'developer', 'programmer', 'software', 'swe', 'devops', 'sre', 'architect', 'technical', 'backend', 'frontend', 'fullstack', 'data engineer', 'ml engineer', 'platform']),
  ('Product', ARRAY['product manager', 'product lead', 'pm', 'product owner', 'product director', 'chief product']),
  ('Design', ARRAY['designer', 'ux', 'ui', 'design lead', 'creative', 'brand']),
  ('Sales', ARRAY['sales', 'account executive', 'ae', 'sdr', 'bdr', 'revenue', 'business development', 'partnerships']),
  ('Marketing', ARRAY['marketing', 'growth', 'demand gen', 'content', 'brand', 'communications', 'pr']),
  ('Executive', ARRAY['ceo', 'cto', 'cfo', 'coo', 'cmo', 'cro', 'chief', 'founder', 'co-founder', 'president', 'general manager']),
  ('Operations', ARRAY['operations', 'ops', 'people ops', 'hr', 'recruiting', 'talent', 'finance', 'legal', 'admin']),
  ('Investing', ARRAY['investor', 'partner', 'principal', 'associate', 'venture', 'vc', 'analyst', 'portfolio']),
  ('Customer Success', ARRAY['customer success', 'cs', 'account manager', 'client', 'support', 'implementation'])
ON CONFLICT (name) DO NOTHING;

-- 7. SENIORITY LEVELS LOOKUP TABLE
CREATE TABLE IF NOT EXISTS seniority_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,  -- 'C-Suite', 'VP', 'Director', etc.
  rank INTEGER NOT NULL,  -- For sorting (higher = more senior)
  keywords TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default seniority levels
INSERT INTO seniority_levels (name, rank, keywords) VALUES
  ('C-Suite', 100, ARRAY['ceo', 'cto', 'cfo', 'coo', 'cmo', 'cro', 'chief', 'founder', 'co-founder', 'president']),
  ('VP', 80, ARRAY['vp', 'vice president', 'svp', 'evp', 'gvp']),
  ('Director', 60, ARRAY['director', 'head of', 'group lead']),
  ('Manager', 40, ARRAY['manager', 'lead', 'team lead', 'supervisor']),
  ('Senior', 30, ARRAY['senior', 'sr', 'staff', 'principal']),
  ('Mid', 20, ARRAY['mid', 'ii', 'iii', '2', '3']),
  ('Junior', 10, ARRAY['junior', 'jr', 'associate', 'entry', 'intern', 'i', '1'])
ON CONFLICT (name) DO NOTHING;

-- 8. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_contacts_enrichment_priority ON contacts(enrichment_priority DESC) WHERE enriched = false;
CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts(source);
CREATE INDEX IF NOT EXISTS idx_contacts_is_marketing ON contacts(is_marketing_contact);
CREATE INDEX IF NOT EXISTS idx_work_history_company_normalized ON work_history(company_normalized);
CREATE INDEX IF NOT EXISTS idx_work_history_role_category ON work_history(role_category);
CREATE INDEX IF NOT EXISTS idx_work_history_seniority ON work_history(seniority_level);
CREATE INDEX IF NOT EXISTS idx_enrichment_log_user_date ON enrichment_log(user_id, created_at DESC);

-- 9. RLS POLICIES
ALTER TABLE enrichment_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrichment_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE seniority_levels ENABLE ROW LEVEL SECURITY;

-- Users can only see their own budget
CREATE POLICY "Users can view own budget" ON enrichment_budget
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own budget" ON enrichment_budget
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can only see their own enrichment logs
CREATE POLICY "Users can view own enrichment logs" ON enrichment_log
  FOR SELECT USING (auth.uid() = user_id);

-- Everyone can read lookup tables
CREATE POLICY "Anyone can read role categories" ON role_categories
  FOR SELECT USING (true);

CREATE POLICY "Anyone can read seniority levels" ON seniority_levels
  FOR SELECT USING (true);

-- 10. FUNCTION TO CALCULATE ENRICHMENT PRIORITY
CREATE OR REPLACE FUNCTION calculate_enrichment_priority(
  p_source contact_source,
  p_inbound_count INTEGER,
  p_outbound_count INTEGER,
  p_meeting_count INTEGER,
  p_is_marketing BOOLEAN,
  p_last_interaction TIMESTAMPTZ
) RETURNS INTEGER AS $$
DECLARE
  priority INTEGER := 0;
  recency_days INTEGER;
BEGIN
  -- LinkedIn contacts get base priority (always enrich)
  IF p_source = 'linkedin_csv' THEN
    priority := priority + 1000;
  END IF;

  -- Email interaction scoring
  priority := priority + (p_inbound_count * 10);
  priority := priority + (p_outbound_count * 15);  -- Outbound slightly more valuable

  -- Meeting scoring (meetings are high signal)
  priority := priority + (p_meeting_count * 50);

  -- Two-way communication bonus
  IF p_inbound_count > 0 AND p_outbound_count > 0 THEN
    priority := priority + 100;
  END IF;

  -- Marketing contact penalty
  IF p_is_marketing THEN
    priority := priority - 500;
  END IF;

  -- Recency bonus (interactions in last 90 days)
  IF p_last_interaction IS NOT NULL THEN
    recency_days := EXTRACT(DAY FROM (NOW() - p_last_interaction));
    IF recency_days <= 30 THEN
      priority := priority + 200;
    ELSIF recency_days <= 90 THEN
      priority := priority + 100;
    ELSIF recency_days <= 180 THEN
      priority := priority + 50;
    END IF;
  END IF;

  RETURN priority;
END;
$$ LANGUAGE plpgsql;

-- 11. TRIGGER TO AUTO-UPDATE ENRICHMENT PRIORITY
CREATE OR REPLACE FUNCTION update_contact_enrichment_priority()
RETURNS TRIGGER AS $$
BEGIN
  NEW.enrichment_priority := calculate_enrichment_priority(
    NEW.source,
    NEW.inbound_email_count,
    NEW.outbound_email_count,
    NEW.meeting_count,
    NEW.is_marketing_contact,
    NEW.last_interaction_at
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_enrichment_priority ON contacts;
CREATE TRIGGER trigger_update_enrichment_priority
  BEFORE INSERT OR UPDATE OF source, inbound_email_count, outbound_email_count, meeting_count, is_marketing_contact, last_interaction_at
  ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_enrichment_priority();

COMMENT ON TABLE enrichment_budget IS 'Tracks PDL enrichment spend per user with approval thresholds';
COMMENT ON TABLE enrichment_log IS 'Audit log of all enrichment API calls for cost tracking';
COMMENT ON TABLE role_categories IS 'Lookup table for normalizing job titles to role categories';
COMMENT ON TABLE seniority_levels IS 'Lookup table for normalizing job titles to seniority levels';
