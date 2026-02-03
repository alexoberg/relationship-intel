-- Migration: Fix contacts junk backfill and update SQL functions with correct column names
-- This migration:
-- 1. Backfills is_junk for existing contacts based on is_likely_marketing and is_generic_mailbox
-- 2. Fixes SQL functions that were using wrong column names (name vs full_name)

-- ============================================================================
-- STEP 1: Backfill is_junk for existing contacts
-- ============================================================================

-- Set is_junk = TRUE for all contacts that have marketing or generic mailbox flags
UPDATE contacts
SET is_junk = TRUE
WHERE (is_likely_marketing = TRUE OR is_generic_mailbox = TRUE)
  AND (is_junk IS NULL OR is_junk = FALSE);

-- Set is_junk = FALSE for contacts that don't have any junk flags (ensure column is not null)
UPDATE contacts
SET is_junk = FALSE
WHERE is_junk IS NULL
  AND (is_likely_marketing = FALSE OR is_likely_marketing IS NULL)
  AND (is_generic_mailbox = FALSE OR is_generic_mailbox IS NULL);

-- ============================================================================
-- STEP 2: Fix find_contacts_by_company function - uses wrong column names
-- ============================================================================

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
    c.full_name as contact_name,  -- Fixed: was c.name
    c.email as contact_email,
    c.linkedin_url as contact_linkedin_url,
    c.connection_strength,
    true as is_current_employee,
    c.current_title as job_title,  -- Fixed: was c.title
    null::text as job_start_date,
    null::text as job_end_date
  FROM public.contacts c
  WHERE c.team_id = p_team_id
    AND c.company_domain = p_company_domain
    AND (c.is_junk = FALSE OR c.is_junk IS NULL)  -- Exclude junk

  UNION ALL

  -- Former employees (from job_history)
  SELECT
    c.id as contact_id,
    c.full_name as contact_name,  -- Fixed: was c.name
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
    AND (job->>'is_current')::boolean = false
    AND (c.is_junk = FALSE OR c.is_junk IS NULL);  -- Exclude junk
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 3: Fix get_contacts_for_enrichment function - uses wrong column names
-- ============================================================================

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
    c.full_name as name,  -- Fixed: was c.name (also rename output for compatibility)
    c.email,
    c.linkedin_url,
    c.company_domain
  FROM public.contacts c
  WHERE c.team_id = p_team_id
    AND c.enrichment_status = 'pending'
    AND (c.email IS NOT NULL OR c.linkedin_url IS NOT NULL)
    AND (c.is_junk = FALSE OR c.is_junk IS NULL)  -- Exclude junk
  ORDER BY c.connection_strength DESC NULLS LAST, c.created_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 4: Update enrichment_candidates view to use correct column filtering
-- ============================================================================

CREATE OR REPLACE VIEW enrichment_candidates AS
SELECT
  c.*,
  (COALESCE(c.inbound_email_count, 0) * 10 + COALESCE(c.outbound_email_count, 0) * 15 + COALESCE(c.meeting_count, 0) * 25) as interaction_score
FROM contacts c
WHERE c.enriched = FALSE
  AND (c.is_junk = FALSE OR c.is_junk IS NULL)  -- Use is_junk for filtering
  AND (c.email IS NOT NULL OR c.linkedin_url IS NOT NULL)
ORDER BY c.enrichment_priority DESC;

-- ============================================================================
-- STEP 5: Log the changes
-- ============================================================================

DO $$
DECLARE
  junk_count INTEGER;
  non_junk_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO junk_count FROM contacts WHERE is_junk = TRUE;
  SELECT COUNT(*) INTO non_junk_count FROM contacts WHERE is_junk = FALSE;
  RAISE NOTICE 'Migration complete: % contacts marked as junk, % contacts marked as non-junk', junk_count, non_junk_count;
END $$;
