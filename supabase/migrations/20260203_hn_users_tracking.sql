-- ============================================
-- HN USERS TRACKING TABLE
-- ============================================
-- Persistent tracking of HN user profiles for:
-- - Deduplication across scan runs
-- - Profile change detection
-- - User credibility signals (karma, account age)
-- ============================================

-- Add 'hn_profile' to the source_type check constraint
ALTER TABLE public.listener_discoveries
  DROP CONSTRAINT IF EXISTS listener_discoveries_source_type_check;

ALTER TABLE public.listener_discoveries
  ADD CONSTRAINT listener_discoveries_source_type_check
  CHECK (source_type IN (
    'hn_post', 'hn_comment', 'hn_profile', 'news_article', 'reddit_post',
    'reddit_comment', 'twitter', 'status_page', 'github_issue',
    'list_analysis', 'manual'
  ));

-- ============================================
-- LISTENER HN USERS TABLE
-- ============================================

CREATE TABLE public.listener_hn_users (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- HN user identification
  hn_username text NOT NULL UNIQUE,
  hn_karma integer,
  hn_created_at timestamp with time zone,

  -- Extracted company info (cached)
  company_domain text,
  company_name text,
  extraction_confidence numeric(3,2) CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1),
  extraction_source text CHECK (extraction_source IN (
    'about_url', 'about_text', 'email_domain', 'linkedin', 'twitter', 'github'
  )),
  raw_about text,

  -- Social profile links (for enrichment)
  linkedin_url text,
  twitter_handle text,
  github_username text,
  personal_website text,

  -- Tracking
  first_seen_at timestamp with time zone DEFAULT now(),
  last_scanned_at timestamp with time zone DEFAULT now(),
  scan_count integer DEFAULT 1,
  discoveries_created integer DEFAULT 0,

  -- Thread context (last relevant thread they commented on)
  last_story_id integer,
  last_story_title text,

  -- Flags
  is_excluded boolean DEFAULT false,
  exclusion_reason text,

  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX listener_hn_users_username_idx ON public.listener_hn_users(hn_username);
CREATE INDEX listener_hn_users_company_domain_idx ON public.listener_hn_users(company_domain) WHERE company_domain IS NOT NULL;
CREATE INDEX listener_hn_users_last_scanned_idx ON public.listener_hn_users(last_scanned_at);
CREATE INDEX listener_hn_users_karma_idx ON public.listener_hn_users(hn_karma DESC) WHERE hn_karma IS NOT NULL;
CREATE INDEX listener_hn_users_linkedin_idx ON public.listener_hn_users(linkedin_url) WHERE linkedin_url IS NOT NULL;

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION public.update_listener_hn_user_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listener_hn_users_updated_at
  BEFORE UPDATE ON public.listener_hn_users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_listener_hn_user_timestamp();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.listener_hn_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view HN users" ON public.listener_hn_users
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role full access to HN users" ON public.listener_hn_users
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
