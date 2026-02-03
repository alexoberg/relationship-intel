-- Migration: Add is_junk column that was missing
-- This column is referenced throughout the codebase but was never added to the schema
-- It consolidates is_likely_marketing and is_generic_mailbox into a single flag
-- for simpler filtering in the UI and enrichment pipeline

-- ============================================================================
-- STEP 1: Add the is_junk column
-- ============================================================================

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS is_junk BOOLEAN DEFAULT FALSE;

-- Index for efficient filtering of non-junk contacts
CREATE INDEX IF NOT EXISTS idx_contacts_is_junk
ON contacts (is_junk)
WHERE is_junk = FALSE;

-- ============================================================================
-- STEP 2: Backfill existing contacts
-- Mark as junk if already flagged as marketing or generic mailbox
-- ============================================================================

UPDATE contacts
SET is_junk = TRUE
WHERE is_likely_marketing = TRUE OR is_generic_mailbox = TRUE;

-- ============================================================================
-- STEP 3: Trigger to auto-set is_junk based on email classification
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_sync_is_junk()
RETURNS TRIGGER AS $$
BEGIN
  -- If either flag is set, mark as junk
  IF NEW.is_likely_marketing = TRUE OR NEW.is_generic_mailbox = TRUE THEN
    NEW.is_junk := TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_is_junk_trigger ON contacts;
CREATE TRIGGER sync_is_junk_trigger
  BEFORE INSERT OR UPDATE OF is_likely_marketing, is_generic_mailbox ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION trigger_sync_is_junk();

-- ============================================================================
-- STEP 4: Update enrichment candidates view to also use is_junk
-- ============================================================================

CREATE OR REPLACE VIEW enrichment_candidates AS
SELECT
  c.*,
  (c.inbound_email_count * 10 + c.outbound_email_count * 15 + c.meeting_count * 25) as interaction_score
FROM contacts c
WHERE c.enriched = FALSE
  AND c.is_junk = FALSE
  AND (c.email IS NOT NULL OR c.linkedin_url IS NOT NULL)
ORDER BY c.enrichment_priority DESC;

COMMENT ON COLUMN contacts.is_junk IS 'Consolidated flag indicating contact should be filtered from UI and enrichment. Set automatically when is_likely_marketing or is_generic_mailbox is true, or manually for other junk patterns.';
