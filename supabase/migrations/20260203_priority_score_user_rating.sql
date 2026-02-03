-- ============================================
-- UPDATE PRIORITY SCORE TO USE USER RATING AS THE SCORE
-- ============================================
-- When a user rates a prospect, their rating BECOMES the score (scaled 0-100)
-- Unrated prospects fall back to helix_fit_score
-- Connection score is ignored (data quality issues)
-- ============================================

-- Drop the old generated column and recreate with new formula
ALTER TABLE public.prospects DROP COLUMN IF EXISTS priority_score;

ALTER TABLE public.prospects ADD COLUMN priority_score integer GENERATED ALWAYS AS (
  CASE
    WHEN user_rating IS NOT NULL THEN
      -- User rating becomes the score: 1-10 scaled to 10-100
      user_rating * 10
    ELSE
      -- No user rating: use AI score
      COALESCE(helix_fit_score, 0)
  END
) STORED;

-- Recreate the index
CREATE INDEX IF NOT EXISTS prospects_priority_score_idx ON public.prospects(priority_score DESC);
