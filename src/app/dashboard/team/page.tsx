'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Users, Link2, Plus, Copy, Check, Trash2, Crown, User, Loader2, Sparkles, ChevronDown, Shield, UserMinus } from 'lucide-react';

interface Team {
  id: string;
  name: string;
  role: 'admin' | 'member';
}

interface TeamMember {
  id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
  profile: {
    email: string;
    full_name: string | null;
  };
}

interface Invite {
  id: string;
  code: string;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  is_active: boolean;
  created_at: string;
}

export default function TeamPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [memberMenuOpen, setMemberMenuOpen] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    loadTeams();
  }, []);

  useEffect(() => {
    if (selectedTeam) {
      loadTeamData(selectedTeam.id);
    }
  }, [selectedTeam]);

  async function loadTeams() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

      const response = await fetch('/api/teams');
      const data = await response.json();
      setTeams(data.teams || []);
      if (data.teams?.length > 0) {
        setSelectedTeam(data.teams[0]);
      }
    } catch (err) {
      console.error('Failed to load teams:', err);
    }
    setLoading(false);
  }

  async function loadTeamData(teamId: string) {
    try {
      // Load members
      const { data: membersData } = await supabase
        .from('team_members')
        .select('*, profile:profiles(email, full_name)')
        .eq('team_id', teamId);

      setMembers(membersData || []);

      // Load invites (only for admins)
      const response = await fetch(`/api/teams/invites?team_id=${teamId}`);
      if (response.ok) {
        const data = await response.json();
        setInvites(data.invites || []);
      }
    } catch (err) {
      console.error('Failed to load team data:', err);
    }
  }

  async function createTeam() {
    if (!newTeamName.trim()) return;
    setCreating(true);

    try {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName.trim() })
      });

      if (response.ok) {
        setNewTeamName('');
        setShowNewTeam(false);
        loadTeams();
      }
    } catch (err) {
      console.error('Failed to create team:', err);
    }
    setCreating(false);
  }

  async function createInvite() {
    if (!selectedTeam) return;

    try {
      const response = await fetch('/api/teams/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: selectedTeam.id,
          expires_in_days: 7
        })
      });

      if (response.ok) {
        loadTeamData(selectedTeam.id);
      }
    } catch (err) {
      console.error('Failed to create invite:', err);
    }
  }

  async function deactivateInvite(inviteId: string) {
    try {
      await fetch(`/api/teams/invites?id=${inviteId}`, { method: 'DELETE' });
      if (selectedTeam) {
        loadTeamData(selectedTeam.id);
      }
    } catch (err) {
      console.error('Failed to deactivate invite:', err);
    }
  }

  function copyInviteLink(code: string) {
    const url = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  async function updateMemberRole(memberId: string, newRole: 'admin' | 'member') {
    if (!selectedTeam) return;
    setMemberMenuOpen(null);

    try {
      const response = await fetch('/api/teams/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: selectedTeam.id,
          member_id: memberId,
          role: newRole
        })
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'Failed to update role');
        return;
      }

      loadTeamData(selectedTeam.id);
    } catch (err) {
      console.error('Failed to update member role:', err);
    }
  }

  async function removeMember(memberId: string) {
    if (!selectedTeam) return;
    if (!confirm('Are you sure you want to remove this member from the team?')) return;
    setMemberMenuOpen(null);

    try {
      const response = await fetch(
        `/api/teams/members?team_id=${selectedTeam.id}&member_id=${memberId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'Failed to remove member');
        return;
      }

      loadTeamData(selectedTeam.id);
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  }

  const isAdmin = selectedTeam?.role === 'admin';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-dark-900">Team Network</h1>
          </div>
          <p className="text-dark-500">Manage your team and invite new members to pool network data</p>
        </div>

        {teams.length === 0 ? (
          <button
            onClick={() => setShowNewTeam(true)}
            className="btn-primary"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Team
          </button>
        ) : (
          <select
            value={selectedTeam?.id || ''}
            onChange={(e) => {
              const team = teams.find(t => t.id === e.target.value);
              setSelectedTeam(team || null);
            }}
            className="input max-w-xs"
          >
            {teams.map(team => (
              <option key={team.id} value={team.id}>
                {team.name} ({team.role})
              </option>
            ))}
          </select>
        )}
      </div>

      {showNewTeam && (
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-primary-500" />
            <h3 className="font-semibold text-dark-900">Create New Team</h3>
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Team name (e.g., Alex's Network)"
              className="input flex-1"
            />
            <button
              onClick={createTeam}
              disabled={creating || !newTeamName.trim()}
              className="btn-primary"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => setShowNewTeam(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {selectedTeam && (
        <>
          {/* Members Section */}
          <div className="card overflow-hidden">
            <div className="p-6 border-b border-dark-100 bg-gradient-to-r from-dark-50 to-white">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                  <Users className="w-4 h-4 text-primary-600" />
                </div>
                <h2 className="text-lg font-semibold text-dark-900">Team Members</h2>
                <span className="badge bg-primary-50 text-primary-700 border border-primary-200">{members.length}</span>
              </div>
            </div>
            <div className="divide-y divide-dark-100">
              {members.map(member => (
                <div key={member.id} className="p-4 flex items-center justify-between hover:bg-dark-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      member.role === 'admin'
                        ? 'bg-gradient-to-br from-amber-400 to-orange-500'
                        : 'bg-gradient-to-br from-dark-200 to-dark-300'
                    }`}>
                      {member.role === 'admin' ? (
                        <Crown className="w-6 h-6 text-white" />
                      ) : (
                        <User className="w-6 h-6 text-white" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-dark-900">
                        {member.profile?.full_name || member.profile?.email}
                        {member.user_id === currentUserId && (
                          <span className="text-dark-400 font-normal ml-2">(you)</span>
                        )}
                      </p>
                      <p className="text-sm text-dark-500">{member.profile?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${
                      member.role === 'admin'
                        ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-700 border border-amber-200'
                        : 'bg-dark-100 text-dark-600 border border-dark-200'
                    }`}>
                      {member.role === 'admin' ? 'Admin' : 'Member'}
                    </span>
                    {isAdmin && (
                      <div className="relative">
                        <button
                          onClick={() => setMemberMenuOpen(memberMenuOpen === member.id ? null : member.id)}
                          className="p-2 hover:bg-dark-100 rounded-lg transition-colors"
                        >
                          <ChevronDown className="w-4 h-4 text-dark-400" />
                        </button>
                        {memberMenuOpen === member.id && (
                          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-dark-100 py-1 z-10">
                            {member.role === 'member' ? (
                              <button
                                onClick={() => updateMemberRole(member.id, 'admin')}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-dark-50 flex items-center gap-2"
                              >
                                <Shield className="w-4 h-4 text-amber-500" />
                                Promote to Admin
                              </button>
                            ) : (
                              <button
                                onClick={() => updateMemberRole(member.id, 'member')}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-dark-50 flex items-center gap-2"
                              >
                                <User className="w-4 h-4 text-dark-400" />
                                Demote to Member
                              </button>
                            )}
                            <button
                              onClick={() => removeMember(member.id)}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                            >
                              <UserMinus className="w-4 h-4" />
                              Remove from Team
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Invites Section (Admin Only) */}
          {isAdmin && (
            <div className="card overflow-hidden">
              <div className="p-6 border-b border-dark-100 bg-gradient-to-r from-dark-50 to-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent-blue/10 flex items-center justify-center">
                    <Link2 className="w-4 h-4 text-accent-blue" />
                  </div>
                  <h2 className="text-lg font-semibold text-dark-900">Invite Links</h2>
                </div>
                <button onClick={createInvite} className="btn-primary text-sm py-2">
                  <Plus className="w-4 h-4 mr-1" />
                  New Invite
                </button>
              </div>

              {invites.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-dark-100 flex items-center justify-center mx-auto mb-4">
                    <Link2 className="w-8 h-8 text-dark-300" />
                  </div>
                  <p className="font-medium text-dark-700 mb-1">No invite links yet</p>
                  <p className="text-sm text-dark-500">Create an invite link to share with your network</p>
                </div>
              ) : (
                <div className="divide-y divide-dark-100">
                  {invites.filter(i => i.is_active).map(invite => (
                    <div key={invite.id} className="p-4 flex items-center justify-between hover:bg-dark-50 transition-colors">
                      <div>
                        <div className="flex items-center gap-3">
                          <code className="text-sm bg-dark-100 text-dark-700 px-3 py-1.5 rounded-lg font-mono">
                            {invite.code.substring(0, 8)}...
                          </code>
                          <span className="text-sm text-dark-500">
                            Used <span className="font-medium text-dark-700">{invite.use_count}</span>{invite.max_uses ? `/${invite.max_uses}` : ''} times
                          </span>
                        </div>
                        {invite.expires_at && (
                          <p className="text-xs text-dark-400 mt-2">
                            Expires: {new Date(invite.expires_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => copyInviteLink(invite.code)}
                          className="p-2.5 hover:bg-dark-100 rounded-xl transition-colors"
                          title="Copy invite link"
                        >
                          {copiedCode === invite.code ? (
                            <Check className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <Copy className="w-5 h-5 text-dark-400" />
                          )}
                        </button>
                        <button
                          onClick={() => deactivateInvite(invite.id)}
                          className="p-2.5 hover:bg-red-50 rounded-xl transition-colors"
                          title="Deactivate invite"
                        >
                          <Trash2 className="w-5 h-5 text-red-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {teams.length === 0 && !showNewTeam && (
        <div className="card p-12 text-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-100 to-accent-purple/20 flex items-center justify-center mx-auto mb-6">
            <Users className="w-10 h-10 text-primary-500" />
          </div>
          <h3 className="text-xl font-bold text-dark-900 mb-2">No Team Yet</h3>
          <p className="text-dark-500 mb-6 max-w-sm mx-auto">
            Create a team to start inviting people to share their network data with you.
          </p>
          <button
            onClick={() => setShowNewTeam(true)}
            className="btn-primary"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Your Team
          </button>
        </div>
      )}
    </div>
  );
}
