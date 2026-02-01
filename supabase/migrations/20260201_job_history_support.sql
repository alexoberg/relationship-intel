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
