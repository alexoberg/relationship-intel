-- Add sync_runs table for tracking sync progress and debugging
-- This allows us to query sync status directly via Supabase API

CREATE TABLE IF NOT EXISTS sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Sync metadata
  sync_type TEXT NOT NULL DEFAULT 'full', -- 'full' or 'incremental'
  source TEXT NOT NULL DEFAULT 'gmail', -- 'gmail', 'calendar', 'both'
  inngest_run_id TEXT, -- For correlation with Inngest dashboard

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'started', -- 'started', 'fetching_ids', 'fetching_messages', 'processing', 'completed', 'failed'
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Progress metrics
  message_ids_fetched INTEGER DEFAULT 0,
  messages_processed INTEGER DEFAULT 0,
  events_fetched INTEGER DEFAULT 0,
  contacts_created INTEGER DEFAULT 0,
  contacts_updated INTEGER DEFAULT 0,
  emails_synced INTEGER DEFAULT 0,
  meetings_synced INTEGER DEFAULT 0,

  -- Error tracking
  error_message TEXT,
  error_details JSONB,

  -- Step tracking (for long-running syncs)
  current_step TEXT,
  step_progress JSONB, -- e.g., {"step": "fetch-gmail-chunk-5", "processed": 5000, "total": 10000}

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying user's sync history
CREATE INDEX idx_sync_runs_user_id ON sync_runs(user_id);
CREATE INDEX idx_sync_runs_status ON sync_runs(status);
CREATE INDEX idx_sync_runs_started_at ON sync_runs(started_at DESC);

-- RLS policies
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;

-- Users can only view their own sync runs
CREATE POLICY "Users can view own sync runs"
  ON sync_runs FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything (for Inngest background jobs)
CREATE POLICY "Service role full access"
  ON sync_runs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_sync_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_runs_updated_at
  BEFORE UPDATE ON sync_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_sync_runs_updated_at();

-- Add comment
COMMENT ON TABLE sync_runs IS 'Tracks Gmail/Calendar sync runs for debugging and progress monitoring';
