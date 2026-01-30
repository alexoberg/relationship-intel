-- Add last sync timestamp to profiles for incremental sync
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_gmail_sync_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_calendar_sync_at TIMESTAMP WITH TIME ZONE;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_last_gmail_sync ON public.profiles(last_gmail_sync_at);
