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
