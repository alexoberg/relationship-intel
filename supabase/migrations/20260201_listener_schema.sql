-- ============================================
-- LISTENER SERVICE SCHEMA
-- ============================================
-- Always-on intelligence engine for identifying potential Helix clients
-- Monitors HN, tech news, and other sources for companies with pain points
-- ============================================

-- ============================================
-- LISTENER DISCOVERIES TABLE
-- ============================================
-- Staging area for companies discovered via listener
-- Kept separate from prospects until reviewed/promoted

CREATE TABLE public.listener_discoveries (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Company identification
  company_domain text NOT NULL,
  company_name text,

  -- Discovery context
  source_type text NOT NULL CHECK (source_type IN (
    'hn_post', 'hn_comment', 'news_article', 'reddit_post',
    'reddit_comment', 'twitter', 'status_page', 'github_issue',
    'list_analysis', 'manual'
  )),
  source_url text NOT NULL,
  source_title text,

  -- What triggered the discovery
  trigger_text text NOT NULL,  -- The actual quote/snippet
  keywords_matched text[] DEFAULT '{}',
  keyword_category text,  -- 'pain_signal', 'regulatory', 'cost', 'competitor'

  -- Scoring
  confidence_score integer DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  relevance_score integer DEFAULT 0,  -- How relevant the context is

  -- Helix product mapping (derived from matched keywords)
  helix_products text[] DEFAULT '{}',

  -- Processing state
  status text DEFAULT 'new' CHECK (status IN (
    'new', 'reviewing', 'promoted', 'dismissed', 'duplicate'
  )),
  promoted_prospect_id uuid REFERENCES public.prospects(id),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamp with time zone,
  review_notes text,

  -- Enrichment (populated later)
  enrichment_data jsonb DEFAULT '{}',
  enriched_at timestamp with time zone,

  -- Metadata
  discovered_at timestamp with time zone DEFAULT now() NOT NULL,
  source_published_at timestamp with time zone,  -- When the source was published
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,

  -- Prevent exact duplicates (same domain + source URL)
  UNIQUE(company_domain, source_url)
);

-- ============================================
-- LISTENER RUNS TABLE
-- ============================================
-- Track listener run history for debugging/monitoring

CREATE TABLE public.listener_runs (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,

  source_type text NOT NULL,
  run_type text DEFAULT 'scheduled' CHECK (run_type IN ('scheduled', 'manual', 'backfill')),

  -- Run stats
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  status text DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'partial')),

  -- Results
  items_scanned integer DEFAULT 0,
  discoveries_created integer DEFAULT 0,
  duplicates_skipped integer DEFAULT 0,
  auto_promoted integer DEFAULT 0,
  errors_count integer DEFAULT 0,
  error_details jsonb DEFAULT '[]',

  -- Pagination/cursor tracking (for resumable scans)
  cursor_data jsonb DEFAULT '{}',  -- e.g., {"last_hn_item_id": 12345}

  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ============================================
-- LISTENER KEYWORDS TABLE
-- ============================================
-- Configurable keyword database (allows runtime updates)

CREATE TABLE public.listener_keywords (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,

  keyword text NOT NULL,
  category text NOT NULL CHECK (category IN ('pain_signal', 'regulatory', 'cost', 'competitor')),
  weight integer DEFAULT 1 CHECK (weight >= 1 AND weight <= 5),  -- Higher = more important
  is_active boolean DEFAULT true,

  -- Helix product mapping
  helix_products text[] DEFAULT '{}',

  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,

  UNIQUE(keyword)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX listener_discoveries_domain_idx ON public.listener_discoveries(company_domain);
CREATE INDEX listener_discoveries_status_idx ON public.listener_discoveries(status);
CREATE INDEX listener_discoveries_source_type_idx ON public.listener_discoveries(source_type);
CREATE INDEX listener_discoveries_confidence_idx ON public.listener_discoveries(confidence_score DESC);
CREATE INDEX listener_discoveries_discovered_at_idx ON public.listener_discoveries(discovered_at DESC);
CREATE INDEX listener_discoveries_keywords_idx ON public.listener_discoveries USING GIN(keywords_matched);
CREATE INDEX listener_discoveries_helix_products_idx ON public.listener_discoveries USING GIN(helix_products);

CREATE INDEX listener_runs_source_type_idx ON public.listener_runs(source_type);
CREATE INDEX listener_runs_started_at_idx ON public.listener_runs(started_at DESC);
CREATE INDEX listener_runs_status_idx ON public.listener_runs(status);

CREATE INDEX listener_keywords_category_idx ON public.listener_keywords(category);
CREATE INDEX listener_keywords_active_idx ON public.listener_keywords(is_active) WHERE is_active = true;

-- ============================================
-- TRIGGERS
-- ============================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_listener_discovery_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listener_discoveries_updated_at
  BEFORE UPDATE ON public.listener_discoveries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_listener_discovery_timestamp();

CREATE OR REPLACE FUNCTION public.update_listener_keyword_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listener_keywords_updated_at
  BEFORE UPDATE ON public.listener_keywords
  FOR EACH ROW
  EXECUTE FUNCTION public.update_listener_keyword_timestamp();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
-- Listener tables are service-level, no user-specific RLS
-- Access controlled via service role key

ALTER TABLE public.listener_discoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listener_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listener_keywords ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read discoveries (for dashboard)
CREATE POLICY "Authenticated users can view discoveries" ON public.listener_discoveries
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update discovery status" ON public.listener_discoveries
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view runs" ON public.listener_runs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view keywords" ON public.listener_keywords
  FOR SELECT USING (auth.role() = 'authenticated');

-- Service role can do everything (for cron jobs)
CREATE POLICY "Service role full access to discoveries" ON public.listener_discoveries
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to runs" ON public.listener_runs
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to keywords" ON public.listener_keywords
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- SEED KEYWORDS
-- ============================================

INSERT INTO public.listener_keywords (keyword, category, weight, helix_products) VALUES
-- Pain signals (high weight)
('bot attack', 'pain_signal', 4, ARRAY['captcha_replacement']),
('bot problem', 'pain_signal', 4, ARRAY['captcha_replacement']),
('scraping problem', 'pain_signal', 3, ARRAY['captcha_replacement']),
('getting scraped', 'pain_signal', 3, ARRAY['captcha_replacement']),
('fake accounts', 'pain_signal', 4, ARRAY['voice_captcha']),
('fake users', 'pain_signal', 4, ARRAY['voice_captcha']),
('spam accounts', 'pain_signal', 3, ARRAY['voice_captcha']),
('spam problem', 'pain_signal', 3, ARRAY['captcha_replacement', 'voice_captcha']),
('captcha not working', 'pain_signal', 5, ARRAY['captcha_replacement']),
('captcha bypass', 'pain_signal', 5, ARRAY['captcha_replacement']),
('credential stuffing', 'pain_signal', 4, ARRAY['captcha_replacement']),
('account takeover', 'pain_signal', 4, ARRAY['captcha_replacement']),
('ATO attack', 'pain_signal', 4, ARRAY['captcha_replacement']),
('click fraud', 'pain_signal', 3, ARRAY['captcha_replacement']),
('review manipulation', 'pain_signal', 3, ARRAY['voice_captcha']),
('fake reviews', 'pain_signal', 3, ARRAY['voice_captcha']),
('sold out in seconds', 'pain_signal', 4, ARRAY['voice_captcha']),
('bots bought everything', 'pain_signal', 5, ARRAY['voice_captcha']),
('scalper bots', 'pain_signal', 5, ARRAY['voice_captcha']),
('ticket bots', 'pain_signal', 5, ARRAY['voice_captcha']),
('sneaker bots', 'pain_signal', 5, ARRAY['voice_captcha']),
('GPU bots', 'pain_signal', 4, ARRAY['voice_captcha']),
('DDoS attack', 'pain_signal', 3, ARRAY['captcha_replacement']),
('brute force attack', 'pain_signal', 3, ARRAY['captcha_replacement']),

-- Regulatory (medium-high weight)
('age verification', 'regulatory', 4, ARRAY['age_verification']),
('verify age', 'regulatory', 4, ARRAY['age_verification']),
('age gate', 'regulatory', 3, ARRAY['age_verification']),
('KYC', 'regulatory', 3, ARRAY['age_verification']),
('identity verification', 'regulatory', 3, ARRAY['age_verification']),
('COPPA compliance', 'regulatory', 5, ARRAY['age_verification']),
('COPPA violation', 'regulatory', 5, ARRAY['age_verification']),
('DSA compliance', 'regulatory', 4, ARRAY['age_verification', 'voice_captcha']),
('minors on platform', 'regulatory', 4, ARRAY['age_verification']),
('underage users', 'regulatory', 4, ARRAY['age_verification']),
('child safety', 'regulatory', 4, ARRAY['age_verification']),

-- Cost signals (medium weight)
('fraud costs', 'cost', 3, ARRAY['captcha_replacement', 'voice_captcha']),
('fraud losses', 'cost', 3, ARRAY['captcha_replacement', 'voice_captcha']),
('chargebacks', 'cost', 3, ARRAY['captcha_replacement']),
('refund abuse', 'cost', 3, ARRAY['captcha_replacement', 'voice_captcha']),
('promo abuse', 'cost', 3, ARRAY['voice_captcha']),
('coupon abuse', 'cost', 3, ARRAY['voice_captcha']),

-- Competitor mentions (indicates they're in market)
('PerimeterX', 'competitor', 3, ARRAY['captcha_replacement']),
('HUMAN Security', 'competitor', 3, ARRAY['captcha_replacement']),
('Arkose Labs', 'competitor', 3, ARRAY['captcha_replacement']),
('reCAPTCHA frustrating', 'competitor', 4, ARRAY['captcha_replacement']),
('reCAPTCHA broken', 'competitor', 4, ARRAY['captcha_replacement']),
('hCaptcha issues', 'competitor', 4, ARRAY['captcha_replacement']),
('hCaptcha problems', 'competitor', 4, ARRAY['captcha_replacement']),
('Cloudflare turnstile', 'competitor', 3, ARRAY['captcha_replacement']);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to auto-promote high-confidence discoveries
CREATE OR REPLACE FUNCTION public.auto_promote_discovery(
  p_discovery_id uuid,
  p_team_id uuid
)
RETURNS uuid AS $$
DECLARE
  v_discovery record;
  v_prospect_id uuid;
  v_existing_prospect_id uuid;
BEGIN
  -- Get the discovery
  SELECT * INTO v_discovery
  FROM public.listener_discoveries
  WHERE id = p_discovery_id AND status = 'new';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Check if prospect already exists for this domain
  SELECT id INTO v_existing_prospect_id
  FROM public.prospects
  WHERE team_id = p_team_id AND company_domain = v_discovery.company_domain;

  IF v_existing_prospect_id IS NOT NULL THEN
    -- Link to existing prospect, mark as duplicate
    UPDATE public.listener_discoveries
    SET status = 'duplicate',
        promoted_prospect_id = v_existing_prospect_id,
        reviewed_at = now()
    WHERE id = p_discovery_id;

    RETURN v_existing_prospect_id;
  END IF;

  -- Create new prospect
  INSERT INTO public.prospects (
    team_id,
    company_name,
    company_domain,
    helix_products,
    helix_fit_score,
    helix_fit_reason,
    source,
    source_url,
    status
  ) VALUES (
    p_team_id,
    COALESCE(v_discovery.company_name, v_discovery.company_domain),
    v_discovery.company_domain,
    v_discovery.helix_products,
    v_discovery.confidence_score,
    v_discovery.trigger_text,
    'listener',
    v_discovery.source_url,
    'new'
  )
  RETURNING id INTO v_prospect_id;

  -- Update discovery status
  UPDATE public.listener_discoveries
  SET status = 'promoted',
      promoted_prospect_id = v_prospect_id,
      reviewed_at = now()
  WHERE id = p_discovery_id;

  RETURN v_prospect_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
