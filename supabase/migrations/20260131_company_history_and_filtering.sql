-- Migration: Add company history tracking and email filtering support
-- This enables:
-- 1. Storing full work history on contacts (not just current company)
-- 2. Marking contacts as likely marketing/automation to skip PDL enrichment
-- 3. Better querying of "who worked at company X"

-- ============================================================================
-- STEP 1: Add company history fields to contacts table
-- ============================================================================

-- Array of all companies this person has worked at (for querying)
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS company_history TEXT[] DEFAULT '{}';

-- Count of jobs in their history
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS company_history_count INTEGER DEFAULT 0;

-- Earliest job start date (for career length calculation)
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS earliest_work_date DATE;

-- Total career span in years
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS career_years NUMERIC(4,1);

-- Index for searching by past company
CREATE INDEX IF NOT EXISTS idx_contacts_company_history
ON contacts USING GIN(company_history);

-- ============================================================================
-- STEP 2: Add email classification fields
-- ============================================================================

-- Flag for marketing/automation emails that should not be enriched
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS is_likely_marketing BOOLEAN DEFAULT FALSE;

-- Flag for generic company mailboxes (info@, sales@, etc.)
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS is_generic_mailbox BOOLEAN DEFAULT FALSE;

-- Reason why the email was flagged (for debugging)
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS filter_reason TEXT;

-- Index for filtering enrichment candidates
CREATE INDEX IF NOT EXISTS idx_contacts_enrichment_eligible
ON contacts (owner_id, enriched, is_likely_marketing, is_generic_mailbox)
WHERE enriched = FALSE AND is_likely_marketing = FALSE AND is_generic_mailbox = FALSE;

-- ============================================================================
-- STEP 3: Add domain tracking for deduplication
-- ============================================================================

-- Domain extracted from email (for company grouping)
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS email_domain TEXT;

-- Index for domain-based queries
CREATE INDEX IF NOT EXISTS idx_contacts_email_domain
ON contacts (owner_id, email_domain);

-- ============================================================================
-- STEP 4: Update work_history table for better tracking
-- ============================================================================

-- Add created_at if not exists (for tracking when we learned about this job)
ALTER TABLE work_history
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Add source tracking (pdl, linkedin_import, manual)
ALTER TABLE work_history
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'pdl';

-- Index for finding work history by company
CREATE INDEX IF NOT EXISTS idx_work_history_company_normalized
ON work_history (company_normalized);

-- ============================================================================
-- STEP 5: Function to sync company history from work_history to contacts
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_contact_company_history(p_contact_id UUID)
RETURNS void AS $$
DECLARE
  v_companies TEXT[];
  v_count INTEGER;
  v_earliest DATE;
  v_latest DATE;
  v_career_years NUMERIC;
BEGIN
  -- Get distinct normalized company names
  SELECT
    ARRAY_AGG(DISTINCT company_normalized ORDER BY company_normalized),
    COUNT(DISTINCT company_normalized),
    MIN(start_date),
    MAX(COALESCE(end_date, CURRENT_DATE))
  INTO v_companies, v_count, v_earliest, v_latest
  FROM work_history
  WHERE contact_id = p_contact_id
    AND company_normalized IS NOT NULL
    AND company_normalized != '';

  -- Calculate career span in years
  IF v_earliest IS NOT NULL AND v_latest IS NOT NULL THEN
    v_career_years := EXTRACT(YEAR FROM AGE(v_latest, v_earliest)) +
                      EXTRACT(MONTH FROM AGE(v_latest, v_earliest)) / 12.0;
  END IF;

  -- Update the contact
  UPDATE contacts
  SET
    company_history = COALESCE(v_companies, '{}'),
    company_history_count = COALESCE(v_count, 0),
    earliest_work_date = v_earliest,
    career_years = v_career_years,
    updated_at = NOW()
  WHERE id = p_contact_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 6: Function to extract and set email domain
-- ============================================================================

CREATE OR REPLACE FUNCTION extract_email_domain(p_email TEXT)
RETURNS TEXT AS $$
BEGIN
  IF p_email IS NULL OR p_email = '' THEN
    RETURN NULL;
  END IF;

  -- Extract domain from email (everything after @)
  RETURN LOWER(SPLIT_PART(p_email, '@', 2));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- STEP 7: Trigger to auto-extract email domain on insert/update
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_set_email_domain()
RETURNS TRIGGER AS $$
BEGIN
  NEW.email_domain := extract_email_domain(NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_email_domain_trigger ON contacts;
CREATE TRIGGER set_email_domain_trigger
  BEFORE INSERT OR UPDATE OF email ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_email_domain();

-- ============================================================================
-- STEP 8: Update existing contacts with email domains
-- ============================================================================

UPDATE contacts
SET email_domain = extract_email_domain(email)
WHERE email IS NOT NULL AND email_domain IS NULL;

-- ============================================================================
-- STEP 9: Update enrichment priority calculation to exclude marketing
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_enrichment_priority(
  p_contact_id UUID,
  p_inbound_count INTEGER DEFAULT 0,
  p_outbound_count INTEGER DEFAULT 0,
  p_meeting_count INTEGER DEFAULT 0,
  p_has_linkedin BOOLEAN DEFAULT FALSE,
  p_is_marketing BOOLEAN DEFAULT FALSE,
  p_is_generic BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER AS $$
DECLARE
  priority INTEGER := 0;
BEGIN
  -- If marketing or generic, priority is always 0 (never enrich)
  IF p_is_marketing OR p_is_generic THEN
    RETURN 0;
  END IF;

  -- Base score from interactions
  priority := priority + (p_inbound_count * 10);  -- Inbound emails are valuable
  priority := priority + (p_outbound_count * 15); -- Outbound shows intent
  priority := priority + (p_meeting_count * 25);  -- Meetings are highest value

  -- Bonus for having LinkedIn (easier to enrich)
  IF p_has_linkedin THEN
    priority := priority + 50;
  END IF;

  -- Cap at 1000
  RETURN LEAST(priority, 1000);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 10: View for enrichment-eligible contacts
-- ============================================================================

CREATE OR REPLACE VIEW enrichment_candidates AS
SELECT
  c.*,
  (c.inbound_email_count * 10 + c.outbound_email_count * 15 + c.meeting_count * 25) as interaction_score
FROM contacts c
WHERE c.enriched = FALSE
  AND c.is_likely_marketing = FALSE
  AND c.is_generic_mailbox = FALSE
  AND (c.email IS NOT NULL OR c.linkedin_url IS NOT NULL)
ORDER BY c.enrichment_priority DESC;

-- ============================================================================
-- STEP 11: Stats view for monitoring data quality
-- ============================================================================

CREATE OR REPLACE VIEW contact_quality_stats AS
SELECT
  owner_id,
  COUNT(*) as total_contacts,
  COUNT(*) FILTER (WHERE is_likely_marketing) as marketing_contacts,
  COUNT(*) FILTER (WHERE is_generic_mailbox) as generic_mailbox_contacts,
  COUNT(*) FILTER (WHERE enriched) as enriched_contacts,
  COUNT(*) FILTER (WHERE NOT enriched AND NOT is_likely_marketing AND NOT is_generic_mailbox) as enrichment_eligible,
  COUNT(*) FILTER (WHERE company_history_count > 1) as contacts_with_job_history,
  AVG(company_history_count) FILTER (WHERE enriched) as avg_jobs_per_enriched_contact,
  AVG(career_years) FILTER (WHERE career_years IS NOT NULL) as avg_career_years
FROM contacts
GROUP BY owner_id;

COMMENT ON VIEW contact_quality_stats IS 'Dashboard view for monitoring contact data quality and enrichment progress';

-- ============================================================================
-- STEP 12: Atomic budget increment function (fixes concurrent update bug)
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_enrichment_budget(
  p_budget_id UUID,
  p_cost NUMERIC DEFAULT 0.05
)
RETURNS void AS $$
BEGIN
  UPDATE enrichment_budget
  SET
    total_spent = total_spent + p_cost,
    enrichments_count = enrichments_count + 1,
    last_enrichment_at = NOW(),
    updated_at = NOW()
  WHERE id = p_budget_id;
END;
$$ LANGUAGE plpgsql;
