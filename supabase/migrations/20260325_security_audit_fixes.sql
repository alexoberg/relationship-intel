-- ============================================
-- SECURITY AUDIT FIXES - 2026-03-25
-- ============================================
-- Fixes identified during Supabase security audit:
-- 1. Restrict listener table RLS (was open to all authenticated users)
-- 2. Fix invite enumeration (was exposing all active invites to anon)
-- 3. Add missing UPDATE/DELETE policies for several tables
-- ============================================

-- ============================================
-- 1. FIX LISTENER TABLE RLS
-- Previously: any authenticated user could view/update all discoveries
-- Now: scoped to team membership (discoveries link to prospects which link to teams)
-- ============================================

-- listener_discoveries: restrict to team members only
DROP POLICY IF EXISTS "Authenticated users can view discoveries" ON public.listener_discoveries;
DROP POLICY IF EXISTS "Authenticated users can update discovery status" ON public.listener_discoveries;

CREATE POLICY "Team members can view discoveries" ON public.listener_discoveries
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND (
      -- Discoveries promoted to a prospect are visible to that prospect's team
      EXISTS (
        SELECT 1 FROM public.prospects p
        JOIN public.team_members tm ON tm.team_id = p.team_id
        WHERE p.id = listener_discoveries.promoted_prospect_id
        AND tm.user_id = auth.uid()
      )
      -- Unlinked discoveries visible to any team member (shared resource)
      OR (
        listener_discoveries.promoted_prospect_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.team_members WHERE user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Team members can update discovery status" ON public.listener_discoveries
  FOR UPDATE USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- listener_runs: restrict to team members
DROP POLICY IF EXISTS "Authenticated users can view runs" ON public.listener_runs;

CREATE POLICY "Team members can view runs" ON public.listener_runs
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- listener_keywords: restrict to team members
DROP POLICY IF EXISTS "Authenticated users can view keywords" ON public.listener_keywords;

CREATE POLICY "Team members can view keywords" ON public.listener_keywords
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- listener_hn_users: restrict to team members
DROP POLICY IF EXISTS "Authenticated users can view HN users" ON public.listener_hn_users;

CREATE POLICY "Team members can view HN users" ON public.listener_hn_users
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- 2. FIX INVITE ENUMERATION
-- Previously: anyone (including anon) could enumerate all active invites
-- Now: only allow validation of a specific invite code via RPC function
-- ============================================

DROP POLICY IF EXISTS "Anyone can validate invite codes" ON public.invites;

-- Replace open SELECT with a SECURITY DEFINER function for invite validation
CREATE OR REPLACE FUNCTION public.validate_invite_code(invite_code text)
RETURNS json AS $$
DECLARE
  invite_record record;
  team_record record;
BEGIN
  SELECT i.id, i.is_active, i.expires_at, i.max_uses, i.use_count, i.team_id
  INTO invite_record
  FROM public.invites i
  WHERE i.code = invite_code;

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'error', 'Invite not found');
  END IF;

  IF NOT invite_record.is_active THEN
    RETURN json_build_object('valid', false, 'error', 'Invite is no longer active');
  END IF;

  IF invite_record.expires_at IS NOT NULL AND invite_record.expires_at < now() THEN
    RETURN json_build_object('valid', false, 'error', 'Invite has expired');
  END IF;

  IF invite_record.max_uses IS NOT NULL AND invite_record.use_count >= invite_record.max_uses THEN
    RETURN json_build_object('valid', false, 'error', 'Invite has reached maximum uses');
  END IF;

  -- Get team name for display
  SELECT name INTO team_record FROM public.teams WHERE id = invite_record.team_id;

  RETURN json_build_object(
    'valid', true,
    'team_name', team_record.name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. ADD MISSING UPDATE/DELETE POLICIES
-- ============================================

-- work_history: allow owners to update/delete
CREATE POLICY "Users can update work history for own contacts" ON public.work_history
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.contacts
      WHERE contacts.id = work_history.contact_id
      AND contacts.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete work history for own contacts" ON public.work_history
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.contacts
      WHERE contacts.id = work_history.contact_id
      AND contacts.owner_id = auth.uid()
    )
  );

-- email_interactions: allow owners to update/delete
CREATE POLICY "Users can update own email interactions" ON public.email_interactions
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own email interactions" ON public.email_interactions
  FOR DELETE USING (auth.uid() = owner_id);

-- calendar_interactions: allow owners to update/delete
CREATE POLICY "Users can update own calendar interactions" ON public.calendar_interactions
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own calendar interactions" ON public.calendar_interactions
  FOR DELETE USING (auth.uid() = owner_id);
