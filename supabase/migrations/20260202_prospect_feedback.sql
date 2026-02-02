-- ============================================
-- PROSPECT FEEDBACK TABLE
-- ============================================
-- Detailed feedback for AI learning
-- Each review captures AI context for training
-- ============================================

-- Detailed feedback table for AI learning
CREATE TABLE IF NOT EXISTS public.prospect_feedback (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  prospect_id uuid REFERENCES public.prospects(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) NOT NULL,

  -- Core feedback
  is_good_fit boolean NOT NULL,
  confidence integer CHECK (confidence >= 1 AND confidence <= 5), -- Optional 1-5 rating
  feedback_reason text, -- Why user agrees/disagrees with AI

  -- Context at time of feedback (for training)
  ai_helix_fit_score integer, -- What AI scored it
  ai_helix_fit_reason text, -- What AI said
  ai_helix_products text[],

  -- Metadata
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  review_time_ms integer, -- How long user spent reviewing

  -- One feedback per user per prospect
  UNIQUE(prospect_id, user_id)
);

-- Add review tracking columns to prospects if not exist
ALTER TABLE public.prospects
ADD COLUMN IF NOT EXISTS user_fit_override boolean,
ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS prospect_feedback_prospect_id_idx ON public.prospect_feedback(prospect_id);
CREATE INDEX IF NOT EXISTS prospect_feedback_team_id_idx ON public.prospect_feedback(team_id);
CREATE INDEX IF NOT EXISTS prospect_feedback_user_id_idx ON public.prospect_feedback(user_id);
CREATE INDEX IF NOT EXISTS prospect_feedback_is_good_fit_idx ON public.prospect_feedback(is_good_fit);
CREATE INDEX IF NOT EXISTS prospect_feedback_created_at_idx ON public.prospect_feedback(created_at DESC);

-- Index for finding unreviewed prospects
CREATE INDEX IF NOT EXISTS prospects_reviewed_at_idx ON public.prospects(reviewed_at);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.prospect_feedback ENABLE ROW LEVEL SECURITY;

-- Team members can view all feedback for their team
CREATE POLICY "Team members can view feedback" ON public.prospect_feedback
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = prospect_feedback.team_id
      AND team_members.user_id = auth.uid()
    )
  );

-- Users can insert their own feedback
CREATE POLICY "Users can insert own feedback" ON public.prospect_feedback
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = prospect_feedback.team_id
      AND team_members.user_id = auth.uid()
    )
  );

-- Users can update their own feedback
CREATE POLICY "Users can update own feedback" ON public.prospect_feedback
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own feedback
CREATE POLICY "Users can delete own feedback" ON public.prospect_feedback
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to submit feedback and update prospect
CREATE OR REPLACE FUNCTION public.submit_prospect_feedback(
  p_prospect_id uuid,
  p_is_good_fit boolean,
  p_feedback_reason text DEFAULT NULL,
  p_confidence integer DEFAULT NULL,
  p_review_time_ms integer DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_feedback_id uuid;
  v_team_id uuid;
  v_user_id uuid;
  v_ai_score integer;
  v_ai_reason text;
  v_ai_products text[];
BEGIN
  v_user_id := auth.uid();

  -- Get prospect details
  SELECT team_id, helix_fit_score, helix_fit_reason, helix_products
  INTO v_team_id, v_ai_score, v_ai_reason, v_ai_products
  FROM public.prospects
  WHERE id = p_prospect_id;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Prospect not found';
  END IF;

  -- Insert or update feedback
  INSERT INTO public.prospect_feedback (
    prospect_id, team_id, user_id,
    is_good_fit, confidence, feedback_reason,
    ai_helix_fit_score, ai_helix_fit_reason, ai_helix_products,
    review_time_ms
  )
  VALUES (
    p_prospect_id, v_team_id, v_user_id,
    p_is_good_fit, p_confidence, p_feedback_reason,
    v_ai_score, v_ai_reason, v_ai_products,
    p_review_time_ms
  )
  ON CONFLICT (prospect_id, user_id)
  DO UPDATE SET
    is_good_fit = EXCLUDED.is_good_fit,
    confidence = EXCLUDED.confidence,
    feedback_reason = EXCLUDED.feedback_reason,
    ai_helix_fit_score = EXCLUDED.ai_helix_fit_score,
    ai_helix_fit_reason = EXCLUDED.ai_helix_fit_reason,
    ai_helix_products = EXCLUDED.ai_helix_products,
    review_time_ms = EXCLUDED.review_time_ms,
    created_at = now()
  RETURNING id INTO v_feedback_id;

  -- Update prospect with review info
  UPDATE public.prospects
  SET
    user_fit_override = p_is_good_fit,
    reviewed_at = now(),
    reviewed_by = v_user_id,
    -- Also update legacy fields
    is_good_fit = p_is_good_fit,
    feedback_notes = p_feedback_reason,
    feedback_by = v_user_id,
    feedback_at = now(),
    -- If marked as not a fit, update status
    status = CASE
      WHEN p_is_good_fit = false AND status = 'new' THEN 'not_a_fit'
      ELSE status
    END
  WHERE id = p_prospect_id;

  -- Log activity
  PERFORM public.log_prospect_activity(
    p_prospect_id,
    v_user_id,
    'feedback_given',
    jsonb_build_object(
      'is_good_fit', p_is_good_fit,
      'feedback_reason', p_feedback_reason,
      'confidence', p_confidence
    )
  );

  RETURN v_feedback_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
