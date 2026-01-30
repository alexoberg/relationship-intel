'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Users, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'joining' | 'success' | 'error'>('loading');
  const [teamName, setTeamName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [user, setUser] = useState<any>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    checkInvite();
  }, [code]);

  async function checkInvite() {
    // Check if user is logged in
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    // Validate invite
    const { data: invite, error } = await supabase
      .from('invites')
      .select('*, team:teams(name)')
      .eq('code', code)
      .eq('is_active', true)
      .single();

    if (error || !invite) {
      setStatus('invalid');
      setError('This invite link is invalid or has expired.');
      return;
    }

    // Check expiry
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      setStatus('invalid');
      setError('This invite link has expired.');
      return;
    }

    // Check max uses
    if (invite.max_uses && invite.use_count >= invite.max_uses) {
      setStatus('invalid');
      setError('This invite link has reached its maximum uses.');
      return;
    }

    setTeamName(invite.team?.name || 'Unknown Team');
    setStatus('valid');
  }

  async function handleJoin() {
    if (!user) {
      // Redirect to login with return URL
      const returnUrl = encodeURIComponent(window.location.pathname);
      router.push(`/login?returnTo=${returnUrl}`);
      return;
    }

    setStatus('joining');

    try {
      const response = await fetch('/api/teams/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to join team');
      }

      setStatus('success');
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to join team');
    }
  }

  async function handleLogin() {
    const returnUrl = encodeURIComponent(window.location.pathname);
    router.push(`/login?returnTo=${returnUrl}`);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Validating invite...</p>
          </>
        )}

        {status === 'invalid' && (
          <>
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Invite</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={() => router.push('/')}
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
            >
              Go Home
            </button>
          </>
        )}

        {status === 'valid' && (
          <>
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Join {teamName}
            </h1>
            <p className="text-gray-600 mb-6">
              You've been invited to join a network on Relationship Intel.
              Connect your accounts to share contact insights with your team.
            </p>

            {user ? (
              <button
                onClick={handleJoin}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Accept Invite
              </button>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={handleLogin}
                  className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  Sign in to Accept
                </button>
                <p className="text-sm text-gray-500">
                  You'll need to sign in or create an account first
                </p>
              </div>
            )}
          </>
        )}

        {status === 'joining' && (
          <>
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Joining team...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome!</h1>
            <p className="text-gray-600 mb-2">
              You've successfully joined {teamName}.
            </p>
            <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={() => setStatus('valid')}
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
