'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Mail, Calendar, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';

export default function ConnectPage() {
  const [profile, setProfile] = useState<{
    google_access_token: string | null;
    google_token_expiry: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    emailsSynced?: number;
    meetingsSynced?: number;
    contactsUpdated?: number;
    error?: string;
  } | null>(null);

  const searchParams = useSearchParams();
  const success = searchParams.get('success');
  const error = searchParams.get('error');

  const supabase = createClient();

  useEffect(() => {
    loadProfile();
  }, [success]);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('google_access_token, google_token_expiry')
      .eq('id', user.id)
      .single();

    setProfile(data);
    setLoading(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);

    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
      });

      const result = await response.json();
      setSyncResult(result);
    } catch (err) {
      setSyncResult({
        success: false,
        error: err instanceof Error ? err.message : 'Sync failed',
      });
    } finally {
      setSyncing(false);
    }
  };

  const isConnected = !!profile?.google_access_token;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Connect Gmail & Calendar</h1>
        <p className="text-gray-600 mt-1">
          Sync your email and calendar to calculate relationship proximity scores
        </p>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <span className="text-green-800">Google account connected successfully!</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-800">
            Failed to connect: {error.replace(/_/g, ' ')}
          </span>
        </div>
      )}

      {/* Connection Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="flex gap-2">
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <Mail className="w-6 h-6 text-red-600" />
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Gmail & Google Calendar
            </h2>
            <p className="text-gray-600 mt-1">
              We&apos;ll scan your emails and calendar events to find interactions with
              your contacts and calculate proximity scores.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading...
          </div>
        ) : isConnected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Connected</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-2 bg-primary-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {syncing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5" />
                    Sync Now
                  </>
                )}
              </button>

              <a
                href="/api/auth/google"
                className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reconnect
              </a>
            </div>
          </div>
        ) : (
          <a
            href="/api/auth/google"
            className="inline-flex items-center gap-3 bg-white border border-gray-300 rounded-lg px-6 py-3 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Connect Google Account
          </a>
        )}

        {/* Sync Result */}
        {syncResult && (
          <div
            className={`mt-6 p-4 rounded-lg ${
              syncResult.success
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            {syncResult.success ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="font-medium text-green-800">Sync complete</span>
                </div>
                <ul className="text-sm text-green-700 space-y-1">
                  <li>{syncResult.emailsSynced} emails synced</li>
                  <li>{syncResult.meetingsSynced} meetings synced</li>
                  <li>{syncResult.contactsUpdated} contacts updated with proximity scores</li>
                </ul>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="text-red-800">{syncResult.error}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Permissions Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="font-semibold text-blue-900 mb-2">What we access</h3>
        <ul className="text-blue-800 space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 mt-0.5 text-blue-500" />
            <span>
              <strong>Gmail (read-only):</strong> We scan email headers (from, to,
              date) to identify who you&apos;ve communicated with. We don&apos;t store email
              content.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 mt-0.5 text-blue-500" />
            <span>
              <strong>Calendar (read-only):</strong> We check meeting attendees to
              identify who you&apos;ve met with. We don&apos;t store meeting details.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
