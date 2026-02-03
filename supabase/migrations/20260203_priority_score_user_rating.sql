-- ============================================
-- UPDATE PRIORITY SCORE TO HEAVILY WEIGHT USER RATINGS
-- ============================================
-- When a user rates a prospect, their rating should be the primary factor
-- Formula: user_rating (scaled 0-100) + helix_fit_score + connection_score
-- Unrated prospects use: helix_fit_score * 0.4 + connection_score * 0.6
-- ============================================

-- Drop the old generated column and recreate with new formula
ALTER TABLE public.prospects DROP COLUMN IF EXISTS priority_score;

ALTER TABLE public.prospects ADD COLUMN priority_score integer GENERATED ALWAYS AS (
  CASE
    WHEN user_rating IS NOT NULL THEN
      -- User rating is primary: scaled to 0-100, plus AI score and connections as bonus
      (user_rating * 10) + COALESCE(helix_fit_score, 0) + COALESCE(connection_score, 0)
    ELSE
      -- No user rating: weighted combo of AI score and connections
      (COALESCE(helix_fit_score, 0) * 0.4 + COALESCE(connection_score, 0) * 0.6)::integer
  END
) STORED;

-- Recreate the index
CREATE INDEX IF NOT EXISTS prospects_priority_score_idx ON public.prospects(priority_score DESC);
