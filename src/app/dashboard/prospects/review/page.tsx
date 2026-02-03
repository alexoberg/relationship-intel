'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  SkipForward,
  Building,
  ExternalLink,
  Users,
  Link as LinkIcon,
  Shield,
  UserCheck,
  Zap,
  Undo2,
  Info,
  Keyboard,
  Globe,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';

interface ProspectConnection {
  target_name: string;
  target_title: string | null;
  connector_name: string;
  relationship_strength: number;
  connection_context: string | null;
}

interface Prospect {
  id: string;
  company_name: string;
  company_domain: string;
  company_industry?: string | null;
  company_description?: string | null;
  company_size?: string | null;
  funding_stage?: string | null;
  helix_products?: string[] | null;
  helix_fit_score?: number | null;
  helix_fit_reason?: string | null;
  connection_score?: number;
  connections_count?: number;
  has_warm_intro?: boolean;
  best_connector?: string | null;
  connection_context?: string | null;
  status: string;
  source?: string | null;
  reviewed_at?: string | null;
  user_fit_override?: boolean | null;
  prospect_connections?: ProspectConnection[];
}

const HELIX_PRODUCTS: Record<string, { label: string; icon: typeof Shield; color: string }> = {
  captcha_replacement: { label: 'Bot Sorter', icon: Shield, color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  voice_captcha: { label: 'Voice Captcha', icon: UserCheck, color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  age_verification: { label: 'Age Verification', icon: Zap, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};

export default function ProspectReviewPage() {
  const router = useRouter();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [userRating, setUserRating] = useState<number | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [reviewHistory, setReviewHistory] = useState<{ prospectId: string; action: 'good' | 'not_fit' | 'skip' }[]>([]);
  const [stats, setStats] = useState({ total: 0, reviewed: 0, unreviewed: 0 });
  const [domainStatus, setDomainStatus] = useState<'checking' | 'live' | 'dead' | null>(null);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const cardStartTime = useRef<number>(Date.now());
  const feedbackInputRef = useRef<HTMLTextAreaElement>(null);

  // Load prospects
  const loadProspects = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/prospects/review?filter=unreviewed&limit=100');
      const data = await response.json();

      if (data.prospects) {
        setProspects(data.prospects);
        setStats({
          total: data.pagination.total,
          reviewed: data.pagination.reviewed,
          unreviewed: data.pagination.unreviewed,
        });
      }
    } catch (error) {
      console.error('Failed to load prospects:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProspects();
  }, [loadProspects]);

  // Check domain status when card changes
  const checkDomain = useCallback(async (domain: string, prospectId: string) => {
    setDomainStatus('checking');
    setDomainError(null);
    try {
      const response = await fetch(`/api/check-domain?domain=${encodeURIComponent(domain)}`);
      const data = await response.json();
      const isDead = data.status !== 'live';
      setDomainStatus(isDead ? 'dead' : 'live');
      if (isDead) {
        setDomainError(data.error || 'unreachable');
        // Auto-mark as not a fit with note about dead domain
        await fetch('/api/prospects/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prospectId,
            isGoodFit: false,
            feedbackReason: `Website down (${data.error || 'unreachable'}) - company may be defunct`,
            userRating: 1,
          }),
        });
      }
    } catch {
      setDomainStatus('dead');
      setDomainError('check failed');
    }
  }, []);

  // Reset timer and check domain when card changes
  useEffect(() => {
    cardStartTime.current = Date.now();
    setFeedbackText('');
    setUserRating(null);
    setShowPreview(false);

    const prospect = prospects[currentIndex];
    if (prospect?.company_domain) {
      checkDomain(prospect.company_domain, prospect.id);
    }
  }, [currentIndex, prospects, checkDomain]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in input
      if (document.activeElement?.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          feedbackInputRef.current?.blur();
        }
        return;
      }

      // Number keys for rating (1-9, 0=10)
      if (e.key >= '1' && e.key <= '9') {
        setUserRating(parseInt(e.key));
        return;
      }
      if (e.key === '0') {
        setUserRating(10);
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'a':
        case 'arrowleft':
          handleFeedback(false);
          break;
        case 'd':
        case 'arrowright':
          handleFeedback(true);
          break;
        case 's':
        case 'arrowup':
          handleSkip();
          break;
        case 'p':
          if (domainStatus === 'live') {
            setShowPreview(s => !s);
          }
          break;
        case ' ':
          e.preventDefault();
          feedbackInputRef.current?.focus();
          break;
        case 'z':
          if (e.metaKey || e.ctrlKey) {
            handleUndo();
          }
          break;
        case '?':
          setShowShortcuts(s => !s);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, prospects, domainStatus]);

  const handleFeedback = async (isGoodFit: boolean) => {
    const prospect = prospects[currentIndex];
    if (!prospect || submitting) return;

    const reviewTimeMs = Date.now() - cardStartTime.current;

    try {
      setSubmitting(true);
      const response = await fetch('/api/prospects/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospectId: prospect.id,
          isGoodFit,
          feedbackReason: feedbackText || null,
          reviewTimeMs,
          userRating: userRating,
        }),
      });

      if (response.ok) {
        setReviewHistory(prev => [...prev, {
          prospectId: prospect.id,
          action: isGoodFit ? 'good' : 'not_fit',
        }]);
        setStats(prev => ({
          ...prev,
          reviewed: prev.reviewed + 1,
          unreviewed: prev.unreviewed - 1,
        }));
        // Remove reviewed prospect from the list so it doesn't reappear
        setProspects(prev => prev.filter(p => p.id !== prospect.id));
        // Don't increment index since we removed the current item
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    const prospect = prospects[currentIndex];
    if (prospect) {
      setReviewHistory(prev => [...prev, {
        prospectId: prospect.id,
        action: 'skip',
      }]);
    }
    moveToNext();
  };

  const handleUndo = async () => {
    if (reviewHistory.length === 0) return;

    const lastAction = reviewHistory[reviewHistory.length - 1];

    // Only revert database for actual feedback actions (not skips)
    if (lastAction.action !== 'skip') {
      try {
        // Revert the prospect in the database
        const response = await fetch('/api/prospects/feedback/undo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prospectId: lastAction.prospectId,
          }),
        });

        if (response.ok) {
          // Update stats
          setStats(prev => ({
            ...prev,
            reviewed: prev.reviewed - 1,
            unreviewed: prev.unreviewed + 1,
          }));
          // Reload the prospects list to get the undone prospect back
          loadProspects();
        }
      } catch (error) {
        console.error('Failed to undo:', error);
      }
    } else {
      // For skips, just go back in index
      setCurrentIndex(prev => Math.max(0, prev - 1));
    }

    setReviewHistory(prev => prev.slice(0, -1));
  };

  const moveToNext = () => {
    if (currentIndex < prospects.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const currentProspect = prospects[currentIndex];
  const progress = stats.total > 0 ? Math.round((stats.reviewed / stats.total) * 100) : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
      </div>
    );
  }

  if (!currentProspect) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-white mb-2">All Done!</h2>
          <p className="text-gray-400 mb-6">
            You&apos;ve reviewed all {stats.total} prospects. Great work!
          </p>
          <button
            onClick={() => router.push('/dashboard/prospects')}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
          >
            Back to Prospects
          </button>
        </div>
      </div>
    );
  }

  const connections = currentProspect.prospect_connections || [];
  const bestConnection = connections[0];

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.push('/dashboard/prospects')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Back to Prospects</span>
          </button>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">
              {stats.reviewed} / {stats.total} reviewed
            </span>
            <button
              onClick={() => setShowShortcuts(s => !s)}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title="Keyboard shortcuts"
            >
              <Keyboard className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-800">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      {/* Shortcuts modal */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowShortcuts(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Keyboard Shortcuts</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Rating (1-10)</span>
                <span className="text-white"><kbd className="px-2 py-1 bg-gray-800 rounded">1-9</kbd>, <kbd className="px-2 py-1 bg-gray-800 rounded">0</kbd>=10</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Good Fit</span>
                <span className="text-white"><kbd className="px-2 py-1 bg-gray-800 rounded">D</kbd> or <kbd className="px-2 py-1 bg-gray-800 rounded">→</kbd></span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Not a Fit</span>
                <span className="text-white"><kbd className="px-2 py-1 bg-gray-800 rounded">A</kbd> or <kbd className="px-2 py-1 bg-gray-800 rounded">←</kbd></span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Skip</span>
                <span className="text-white"><kbd className="px-2 py-1 bg-gray-800 rounded">S</kbd> or <kbd className="px-2 py-1 bg-gray-800 rounded">↑</kbd></span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Preview Site</span>
                <span className="text-white"><kbd className="px-2 py-1 bg-gray-800 rounded">P</kbd></span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Add Note</span>
                <span className="text-white"><kbd className="px-2 py-1 bg-gray-800 rounded">Space</kbd></span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Undo</span>
                <span className="text-white"><kbd className="px-2 py-1 bg-gray-800 rounded">⌘Z</kbd></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          {/* Card */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
            {/* Company header */}
            <div className="p-6 border-b border-gray-800">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-2xl font-bold text-white">
                    {currentProspect.company_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">{currentProspect.company_name}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-2">
                        {/* Domain status indicator */}
                        {domainStatus === 'checking' && (
                          <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                        )}
                        {domainStatus === 'live' && (
                          <span title="Website is live">
                            <CheckCircle className="w-4 h-4 text-green-400" />
                          </span>
                        )}
                        {domainStatus === 'dead' && (
                          <span title={`Website down: ${domainError}`}>
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                          </span>
                        )}
                        <a
                          href={`https://${currentProspect.company_domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`text-sm flex items-center gap-1 ${
                            domainStatus === 'dead'
                              ? 'text-red-400 line-through'
                              : 'text-gray-400 hover:text-purple-400'
                          }`}
                        >
                          {currentProspect.company_domain}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        {domainStatus === 'live' && (
                          <button
                            onClick={() => setShowPreview(!showPreview)}
                            className="p-1 text-gray-500 hover:text-purple-400 transition-colors"
                            title={showPreview ? 'Hide preview' : 'Show preview'}
                          >
                            {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                      {currentProspect.funding_stage && (
                        <>
                          <span className="text-gray-600">•</span>
                          <span className="text-sm text-gray-400 capitalize">{currentProspect.funding_stage.replace('_', ' ')}</span>
                        </>
                      )}
                      {currentProspect.company_industry && (
                        <>
                          <span className="text-gray-600">•</span>
                          <span className="text-sm text-gray-400">{currentProspect.company_industry}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {currentProspect.helix_fit_score !== null && (
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">{currentProspect.helix_fit_score}%</div>
                    <div className="text-xs text-gray-500">AI Score</div>
                  </div>
                )}
              </div>

              {/* Helix products */}
              {currentProspect.helix_products && currentProspect.helix_products.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {currentProspect.helix_products.map(product => {
                    const config = HELIX_PRODUCTS[product];
                    if (!config) return null;
                    const Icon = config.icon;
                    return (
                      <span
                        key={product}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${config.color}`}
                      >
                        <Icon className="w-4 h-4" />
                        {config.label}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Dead website warning */}
              {domainStatus === 'dead' && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <div className="flex-1">
                      <span className="text-red-400 font-medium">Website appears to be down</span>
                      <span className="text-red-400/70 text-sm ml-2">
                        ({domainError === 'timeout' ? 'Timed out' : 'Could not connect'})
                      </span>
                      <p className="text-red-400/60 text-sm mt-1">
                        Auto-marked as not a fit. Company may be defunct.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setStats(prev => ({
                          ...prev,
                          reviewed: prev.reviewed + 1,
                          unreviewed: prev.unreviewed - 1,
                        }));
                        moveToNext();
                      }}
                      className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Website Preview */}
            {showPreview && domainStatus === 'live' && (
              <div className="border-b border-gray-800">
                <div className="bg-gray-800/50 px-4 py-2 flex items-center justify-between">
                  <span className="text-xs text-gray-400 flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    Website Preview
                  </span>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="text-xs text-gray-500 hover:text-gray-300"
                  >
                    Hide
                  </button>
                </div>
                <div className="relative w-full h-64 bg-gray-900">
                  <iframe
                    src={`https://${currentProspect.company_domain}`}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts allow-same-origin"
                    title={`${currentProspect.company_name} website preview`}
                    loading="lazy"
                  />
                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-transparent to-gray-900/50" />
                </div>
              </div>
            )}

            {/* AI Reason */}
            {currentProspect.helix_fit_reason && (
              <div className="p-6 border-b border-gray-800 bg-gradient-to-r from-purple-500/5 to-pink-500/5">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-purple-400 font-medium mb-1">WHY HELIX (AI)</div>
                    <p className="text-gray-300 text-sm leading-relaxed">{currentProspect.helix_fit_reason}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Connections */}
            {connections.length > 0 && (
              <div className="p-6 border-b border-gray-800">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-5 h-5 text-green-400" />
                  <span className="text-sm font-medium text-white">
                    {connections.length} Warm Intro{connections.length > 1 ? 's' : ''}
                  </span>
                </div>
                {bestConnection && (
                  <div className="bg-gray-800/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-white font-medium">
                      <LinkIcon className="w-4 h-4 text-green-400" />
                      {bestConnection.connector_name} → {bestConnection.target_name}
                      {bestConnection.target_title && (
                        <span className="text-gray-400 font-normal text-sm">({bestConnection.target_title})</span>
                      )}
                    </div>
                    {bestConnection.connection_context && (
                      <p className="text-sm text-gray-400 mt-2">{bestConnection.connection_context}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Rating slider */}
            <div className="p-6 border-b border-gray-800">
              <label className="block text-sm font-medium text-gray-400 mb-3">
                Your Rating (1-10) <span className="text-gray-600">— Press number keys</span>
              </label>
              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => (
                  <button
                    key={rating}
                    onClick={() => setUserRating(rating)}
                    className={`w-10 h-10 rounded-lg text-sm font-bold transition-all ${
                      userRating === rating
                        ? rating >= 7
                          ? 'bg-green-500 text-white shadow-lg shadow-green-500/30 scale-110'
                          : rating >= 4
                          ? 'bg-yellow-500 text-white shadow-lg shadow-yellow-500/30 scale-110'
                          : 'bg-red-500 text-white shadow-lg shadow-red-500/30 scale-110'
                        : userRating && userRating >= rating
                        ? rating >= 7
                          ? 'bg-green-500/20 text-green-400'
                          : rating >= 4
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-red-500/20 text-red-400'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {rating}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-xs text-gray-600 mt-2 px-1">
                <span>Not a fit</span>
                <span>Maybe</span>
                <span>Perfect fit</span>
              </div>
            </div>

            {/* Feedback input */}
            <div className="p-6 border-b border-gray-800">
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Your feedback (optional)
              </label>
              <textarea
                ref={feedbackInputRef}
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
                placeholder="Why do you agree or disagree with the AI assessment?"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                rows={2}
              />
            </div>

            {/* Action buttons */}
            <div className="p-6 flex items-center justify-between gap-4">
              <button
                onClick={handleUndo}
                disabled={reviewHistory.length === 0 || submitting}
                className="p-3 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Undo (⌘Z)"
              >
                <Undo2 className="w-6 h-6" />
              </button>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleFeedback(false)}
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  <ThumbsDown className="w-5 h-5" />
                  <span>Not a Fit</span>
                  <kbd className="ml-2 px-1.5 py-0.5 text-xs bg-red-500/20 rounded">A</kbd>
                </button>

                <button
                  onClick={handleSkip}
                  disabled={submitting}
                  className="flex items-center gap-2 px-4 py-3 bg-gray-700/50 hover:bg-gray-700 text-gray-300 rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  <SkipForward className="w-5 h-5" />
                  <kbd className="px-1.5 py-0.5 text-xs bg-gray-600/50 rounded">S</kbd>
                </button>

                <button
                  onClick={() => handleFeedback(true)}
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-3 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  <ThumbsUp className="w-5 h-5" />
                  <span>Good Fit</span>
                  <kbd className="ml-2 px-1.5 py-0.5 text-xs bg-green-500/20 rounded">D</kbd>
                </button>
              </div>

              <div className="w-12" /> {/* Spacer for balance */}
            </div>
          </div>

          {/* Card counter */}
          <div className="text-center mt-4 text-sm text-gray-500">
            {currentIndex + 1} of {prospects.length} in queue
          </div>
        </div>
      </main>
    </div>
  );
}
