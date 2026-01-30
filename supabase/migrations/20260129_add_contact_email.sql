-- Add contact_email column to email_interactions for matching before PDL enrichment
ALTER TABLE email_interactions
ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- Add contact_email column to calendar_interactions for matching before PDL enrichment
ALTER TABLE calendar_interactions
ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- Make contact_id nullable (for unmatched interactions that will be matched later by PDL)
ALTER TABLE email_interactions
ALTER COLUMN contact_id DROP NOT NULL;

ALTER TABLE calendar_interactions
ALTER COLUMN contact_id DROP NOT NULL;

-- Add indexes for matching queries
CREATE INDEX IF NOT EXISTS idx_email_interactions_contact_email
ON email_interactions(contact_email);

CREATE INDEX IF NOT EXISTS idx_calendar_interactions_contact_email
ON calendar_interactions(contact_email);

CREATE INDEX IF NOT EXISTS idx_email_interactions_unmatched
ON email_interactions(owner_id) WHERE contact_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_interactions_unmatched
ON calendar_interactions(owner_id) WHERE contact_id IS NULL;
