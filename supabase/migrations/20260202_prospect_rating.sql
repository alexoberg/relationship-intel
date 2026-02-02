-- ============================================
-- PROSPECT USER RATING (1-10 scale)
-- ============================================
-- Adds a 1-10 rating scale for more granular feedback
-- Used for priority score calculation and AI training
-- ============================================

-- Add user_rating to prospect_feedback table
ALTER TABLE public.prospect_feedback
ADD COLUMN IF NOT EXISTS user_rating integer CHECK (user_rating >= 1 AND user_rating <= 10);

-- Add user_rating to prospects table for quick access
ALTER TABLE public.prospects
ADD COLUMN IF NOT EXISTS user_rating integer CHECK (user_rating >= 1 AND user_rating <= 10);

-- Update the submit_prospect_feedback function to include rating
CREATE OR REPLACE FUNCTION public.submit_prospect_feedback(
  p_prospect_id uuid,
  p_is_good_fit boolean,
  p_feedback_reason text DEFAULT NULL,
  p_confidence integer DEFAULT NULL,
  p_review_time_ms integer DEFAULT NULL,
  p_user_rating integer DEFAULT NULL
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
    review_time_ms, user_rating
  )
  VALUES (
    p_prospect_id, v_team_id, v_user_id,
    p_is_good_fit, p_confidence, p_feedback_reason,
    v_ai_score, v_ai_reason, v_ai_products,
    p_review_time_ms, p_user_rating
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
    user_rating = EXCLUDED.user_rating,
    created_at = now()
  RETURNING id INTO v_feedback_id;

  -- Update prospect with review info and rating
  UPDATE public.prospects
  SET
    user_fit_override = p_is_good_fit,
    reviewed_at = now(),
    reviewed_by = v_user_id,
    user_rating = p_user_rating,
    -- Also update legacy fields
    is_good_fit = p_is_good_fit,
    feedback_notes = p_feedback_reason,
    feedback_by = v_user_id,
    feedback_at = now(),
    -- Recalculate priority score incorporating user rating
    priority_score = CASE
      WHEN p_user_rating IS NOT NULL THEN
        -- User rating (0-100 scale) + connection score + helix fit
        (p_user_rating * 10) + COALESCE(connection_score, 0) + COALESCE(helix_fit_score, 0)
      ELSE priority_score
    END,
    -- If marked as not a fit, update status
    status = CASE
      WHEN p_is_good_fit = false AND status = 'new' THEN 'not_a_fit'
      WHEN p_is_good_fit = true AND status = 'not_a_fit' THEN 'new'
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
      'confidence', p_confidence,
      'user_rating', p_user_rating
    )
  );

  RETURN v_feedback_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Index for sorting by user rating
CREATE INDEX IF NOT EXISTS prospects_user_rating_idx ON public.prospects(user_rating DESC NULLS LAST);
