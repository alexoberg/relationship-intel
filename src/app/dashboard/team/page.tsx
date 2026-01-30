'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Users, Link, Plus, Copy, Check, Trash2, Crown, User, Loader2 } from 'lucide-react';

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

  const isAdmin = selectedTeam?.role === 'admin';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Network</h1>
          <p className="text-gray-600">Manage your team and invite new members</p>
        </div>

        {teams.length === 0 ? (
          <button
            onClick={() => setShowNewTeam(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-5 h-5" />
            Create Team
          </button>
        ) : (
          <select
            value={selectedTeam?.id || ''}
            onChange={(e) => {
              const team = teams.find(t => t.id === e.target.value);
              setSelectedTeam(team || null);
            }}
            className="px-4 py-2 border rounded-lg"
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
        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <h3 className="font-semibold mb-4">Create New Team</h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Team name (e.g., Alex's Network)"
              className="flex-1 px-4 py-2 border rounded-lg"
            />
            <button
              onClick={createTeam}
              disabled={creating || !newTeamName.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => setShowNewTeam(false)}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {selectedTeam && (
        <>
          {/* Members Section */}
          <div className="bg-white rounded-xl shadow-sm border">
            <div className="p-6 border-b">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-gray-400" />
                <h2 className="text-lg font-semibold">Team Members</h2>
                <span className="text-sm text-gray-500">({members.length})</span>
              </div>
            </div>
            <div className="divide-y">
              {members.map(member => (
                <div key={member.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                      {member.role === 'admin' ? (
                        <Crown className="w-5 h-5 text-yellow-500" />
                      ) : (
                        <User className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">
                        {member.profile?.full_name || member.profile?.email}
                      </p>
                      <p className="text-sm text-gray-500">{member.profile?.email}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    member.role === 'admin'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {member.role}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Invites Section (Admin Only) */}
          {isAdmin && (
            <div className="bg-white rounded-xl shadow-sm border">
              <div className="p-6 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Link className="w-5 h-5 text-gray-400" />
                  <h2 className="text-lg font-semibold">Invite Links</h2>
                </div>
                <button
                  onClick={createInvite}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
                >
                  <Plus className="w-4 h-4" />
                  New Invite
                </button>
              </div>

              {invites.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Link className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p>No invite links yet</p>
                  <p className="text-sm">Create an invite link to share with your network</p>
                </div>
              ) : (
                <div className="divide-y">
                  {invites.filter(i => i.is_active).map(invite => (
                    <div key={invite.id} className="p-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                            {invite.code.substring(0, 8)}...
                          </code>
                          <span className="text-sm text-gray-500">
                            Used {invite.use_count}{invite.max_uses ? `/${invite.max_uses}` : ''} times
                          </span>
                        </div>
                        {invite.expires_at && (
                          <p className="text-xs text-gray-400 mt-1">
                            Expires: {new Date(invite.expires_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyInviteLink(invite.code)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition"
                          title="Copy invite link"
                        >
                          {copiedCode === invite.code ? (
                            <Check className="w-5 h-5 text-green-500" />
                          ) : (
                            <Copy className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                        <button
                          onClick={() => deactivateInvite(invite.id)}
                          className="p-2 hover:bg-red-50 rounded-lg transition"
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
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Team Yet</h3>
          <p className="text-gray-600 mb-4">
            Create a team to start inviting people to share their network data with you.
          </p>
          <button
            onClick={() => setShowNewTeam(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Create Your Team
          </button>
        </div>
      )}
    </div>
  );
}
