'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Search,
  Filter,
  ChevronDown,
  ExternalLink,
  RefreshCw,
  Radio,
  Rss,
  Target,
  Shield,
  UserCheck,
  Zap,
  ThumbsUp,
  ThumbsDown,
  X,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Play,
} from 'lucide-react';

interface Discovery {
  id: string;
  company_domain: string;
  company_name: string | null;
  source_type: string;
  source_url: string;
  source_title: string | null;
  trigger_text: string;
  keywords_matched: string[];
  keyword_category: string | null;
  confidence_score: number;
  helix_products: string[];
  status: string;
  promoted_prospect_id: string | null;
  discovered_at: string;
}

interface ListenerRun {
  id: string;
  source_type: string;
  run_type: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  items_scanned: number;
  discoveries_created: number;
  duplicates_skipped: number;
  errors_count: number;
}

interface Stats {
  discoveries: {
    total: number;
    byStatus: Record<string, number>;
    bySource: Record<string, number>;
    avgConfidence: number;
    last24h: number;
    last7d: number;
  };
  runs: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    last24hRuns: number;
  };
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'new', label: 'New' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'promoted', label: 'Promoted' },
  { value: 'dismissed', label: 'Dismissed' },
];

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'hn_post', label: 'HN Post' },
  { value: 'hn_comment', label: 'HN Comment' },
  { value: 'news_article', label: 'News Article' },
];

export default function ListenerPage() {
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [runs, setRuns] = useState<ListenerRun[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggeringHN, setTriggeringHN] = useState(false);
  const [triggeringRSS, setTriggeringRSS] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedDiscovery, setSelectedDiscovery] = useState<Discovery | null>(null);

  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, [statusFilter, sourceFilter]);

  const loadData = async () => {
    setLoading(true);

    try {
      // Build query params
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (sourceFilter !== 'all') params.set('source_type', sourceFilter);
      params.set('limit', '100');
      params.set('include_stats', 'true');

      // Fetch discoveries
      const discoveriesRes = await fetch(`/api/listener/discoveries?${params}`);
      const discoveriesData = await discoveriesRes.json();

      if (discoveriesData.success) {
        setDiscoveries(discoveriesData.data.discoveries);
        if (discoveriesData.data.stats) {
          setStats(prev => ({ ...prev, discoveries: discoveriesData.data.stats } as Stats));
        }
      }

      // Fetch runs
      const runsRes = await fetch('/api/listener/runs?limit=10&include_stats=true');
      const runsData = await runsRes.json();

      if (runsData.success) {
        setRuns(runsData.data.runs);
        if (runsData.data.stats) {
          setStats(prev => ({ ...prev, runs: runsData.data.stats } as Stats));
        }
      }

      // Fetch full stats
      const statsRes = await fetch('/api/listener/stats');
      const statsData = await statsRes.json();
      if (statsData.success) {
        setStats(statsData.data);
      }
    } catch (error) {
      console.error('Failed to load listener data:', error);
    }

    setLoading(false);
  };

  const handleTriggerScan = async (source: 'hn' | 'rss') => {
    if (source === 'hn') setTriggeringHN(true);
    else setTriggeringRSS(true);

    try {
      const res = await fetch('/api/listener/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });

      if (res.ok) {
        // Reload after a short delay
        setTimeout(loadData, 2000);
      }
    } catch (error) {
      console.error('Failed to trigger scan:', error);
    }

    if (source === 'hn') setTriggeringHN(false);
    else setTriggeringRSS(false);
  };

  const handlePromote = async (discoveryId: string) => {
    try {
      const res = await fetch(`/api/listener/discoveries/${discoveryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'promote' }),
      });

      if (res.ok) {
        setDiscoveries(prev =>
          prev.map(d => d.id === discoveryId ? { ...d, status: 'promoted' } : d)
        );
        if (selectedDiscovery?.id === discoveryId) {
          setSelectedDiscovery(prev => prev ? { ...prev, status: 'promoted' } : null);
        }
      }
    } catch (error) {
      console.error('Failed to promote:', error);
    }
  };

  const handleDismiss = async (discoveryId: string) => {
    try {
      const res = await fetch(`/api/listener/discoveries/${discoveryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      });

      if (res.ok) {
        setDiscoveries(prev =>
          prev.map(d => d.id === discoveryId ? { ...d, status: 'dismissed' } : d)
        );
        if (selectedDiscovery?.id === discoveryId) {
          setSelectedDiscovery(prev => prev ? { ...prev, status: 'dismissed' } : null);
        }
      }
    } catch (error) {
      console.error('Failed to dismiss:', error);
    }
  };

  const filteredDiscoveries = discoveries.filter(d =>
    search
      ? d.company_domain?.toLowerCase().includes(search.toLowerCase()) ||
        d.company_name?.toLowerCase().includes(search.toLowerCase()) ||
        d.trigger_text?.toLowerCase().includes(search.toLowerCase())
      : true
  );

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Listener Intelligence</h1>
            <p className="text-gray-600 mt-1">
              {stats?.discoveries?.total || 0} discoveries • {stats?.discoveries?.last24h || 0} in last 24h
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => handleTriggerScan('hn')}
              disabled={triggeringHN}
              className="flex items-center gap-2 px-4 py-2 bg-orange-50 border border-orange-200 text-orange-700 rounded-lg hover:bg-orange-100 disabled:opacity-50"
            >
              <Radio className={`w-4 h-4 ${triggeringHN ? 'animate-pulse' : ''}`} />
              {triggeringHN ? 'Scanning...' : 'Scan HN'}
            </button>
            <button
              onClick={() => handleTriggerScan('rss')}
              disabled={triggeringRSS}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-50"
            >
              <Rss className={`w-4 h-4 ${triggeringRSS ? 'animate-pulse' : ''}`} />
              {triggeringRSS ? 'Scanning...' : 'Scan RSS'}
            </button>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard
              label="New Discoveries"
              value={stats.discoveries?.byStatus?.new || 0}
              icon={AlertCircle}
              color="blue"
            />
            <StatCard
              label="Promoted"
              value={stats.discoveries?.byStatus?.promoted || 0}
              icon={CheckCircle}
              color="green"
            />
            <StatCard
              label="Avg Confidence"
              value={`${stats.discoveries?.avgConfidence || 0}%`}
              icon={TrendingUp}
              color="purple"
            />
            <StatCard
              label="Last 7 Days"
              value={stats.discoveries?.last7d || 0}
              icon={Clock}
              color="orange"
            />
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search companies, keywords..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Discoveries Table */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : filteredDiscoveries.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Radio className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="font-medium">No discoveries yet</p>
              <p className="text-sm mt-1">Click "Scan HN" or "Scan RSS" to find potential clients</p>
            </div>
          ) : (
            <div className="overflow-y-auto h-full">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Company</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Source</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 max-w-[300px]">Trigger</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Confidence</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredDiscoveries.map((discovery) => (
                    <tr
                      key={discovery.id}
                      onClick={() => setSelectedDiscovery(discovery)}
                      className={`hover:bg-gray-50 cursor-pointer ${
                        selectedDiscovery?.id === discovery.id ? 'bg-primary-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900">
                            {discovery.company_name || discovery.company_domain}
                          </p>
                          <p className="text-sm text-gray-500">{discovery.company_domain}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <SourceBadge source={discovery.source_type} />
                      </td>
                      <td className="px-4 py-3 max-w-[300px]">
                        <p className="text-xs text-gray-600 line-clamp-2">{discovery.trigger_text}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {discovery.keywords_matched?.slice(0, 3).map((kw) => (
                            <span key={kw} className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                              {kw}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <ConfidenceBadge score={discovery.confidence_score} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={discovery.status} />
                      </td>
                      <td className="px-4 py-3">
                        {discovery.status === 'new' && (
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handlePromote(discovery.id); }}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                              title="Promote to Prospect"
                            >
                              <ThumbsUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDismiss(discovery.id); }}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                              title="Dismiss"
                            >
                              <ThumbsDown className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedDiscovery && (
        <div className="w-[400px] bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {selectedDiscovery.company_name || selectedDiscovery.company_domain}
                </h2>
                <a
                  href={`https://${selectedDiscovery.company_domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline text-sm flex items-center gap-1 mt-1"
                >
                  {selectedDiscovery.company_domain}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <button onClick={() => setSelectedDiscovery(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Confidence Score */}
            <div className="p-4 bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl border border-primary-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-primary-800">Confidence Score</span>
                <span className="text-2xl font-bold text-primary-700">{selectedDiscovery.confidence_score}%</span>
              </div>
              <StatusBadge status={selectedDiscovery.status} />
            </div>

            {/* Source */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Source</label>
              <a
                href={selectedDiscovery.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <SourceBadge source={selectedDiscovery.source_type} />
                  <ExternalLink className="w-3 h-3 text-gray-400" />
                </div>
                <p className="text-sm text-gray-600 line-clamp-2">
                  {selectedDiscovery.source_title || selectedDiscovery.source_url}
                </p>
              </a>
            </div>

            {/* Trigger Text */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Why This Company?
              </label>
              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-sm text-gray-700">{selectedDiscovery.trigger_text}</p>
              </div>
            </div>

            {/* Keywords */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Keywords Matched
              </label>
              <div className="flex flex-wrap gap-2">
                {selectedDiscovery.keywords_matched?.map((kw) => (
                  <span
                    key={kw}
                    className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-sm"
                  >
                    {kw}
                  </span>
                ))}
              </div>
              {selectedDiscovery.keyword_category && (
                <p className="text-xs text-gray-500 mt-2 capitalize">
                  Category: {selectedDiscovery.keyword_category.replace('_', ' ')}
                </p>
              )}
            </div>

            {/* Helix Products */}
            {selectedDiscovery.helix_products && selectedDiscovery.helix_products.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Target className="w-4 h-4 inline mr-1" />
                  Suggested Helix Products
                </label>
                <div className="flex flex-wrap gap-2">
                  {selectedDiscovery.helix_products.map((product) => (
                    <HelixProductBadge key={product} product={product} />
                  ))}
                </div>
              </div>
            )}

            {/* Discovered At */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Clock className="w-4 h-4 inline mr-1" />
                Discovered
              </label>
              <p className="text-sm text-gray-600">
                {new Date(selectedDiscovery.discovered_at).toLocaleString()}
              </p>
            </div>

            {/* Actions */}
            {selectedDiscovery.status === 'new' && (
              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => handlePromote(selectedDiscovery.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <ThumbsUp className="w-4 h-4" />
                  Promote to Prospect
                </button>
                <button
                  onClick={() => handleDismiss(selectedDiscovery.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100"
                >
                  <ThumbsDown className="w-4 h-4" />
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string;
  value: number | string;
  icon: typeof AlertCircle;
  color: 'blue' | 'green' | 'purple' | 'orange';
}) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
  };

  return (
    <div className={`p-4 rounded-xl border ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const config: Record<string, { label: string; color: string; icon: typeof Radio }> = {
    hn_post: { label: 'HN Post', color: 'bg-orange-100 text-orange-700', icon: Radio },
    hn_comment: { label: 'HN Comment', color: 'bg-orange-50 text-orange-600', icon: Radio },
    news_article: { label: 'News', color: 'bg-blue-100 text-blue-700', icon: Rss },
  };
  const { label, color, icon: Icon } = config[source] || { label: source, color: 'bg-gray-100 text-gray-700', icon: Radio };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function ConfidenceBadge({ score }: { score: number }) {
  let color = 'bg-gray-100 text-gray-600';
  if (score >= 80) color = 'bg-green-100 text-green-700';
  else if (score >= 60) color = 'bg-yellow-100 text-yellow-700';
  else if (score >= 40) color = 'bg-orange-100 text-orange-700';

  return (
    <span className={`inline-flex px-2 py-1 rounded text-xs font-bold ${color}`}>
      {score}%
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700',
    reviewing: 'bg-purple-100 text-purple-700',
    promoted: 'bg-green-100 text-green-700',
    dismissed: 'bg-gray-100 text-gray-500',
    duplicate: 'bg-gray-100 text-gray-500',
  };
  const labels: Record<string, string> = {
    new: 'New',
    reviewing: 'Reviewing',
    promoted: 'Promoted',
    dismissed: 'Dismissed',
    duplicate: 'Duplicate',
  };

  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${config[status] || config.new}`}>
      {labels[status] || status}
    </span>
  );
}

function HelixProductBadge({ product }: { product: string }) {
  const config: Record<string, { label: string; icon: typeof Shield; color: string }> = {
    captcha_replacement: { label: 'Bot Sorter', icon: Shield, color: 'bg-purple-100 text-purple-700 border-purple-200' },
    voice_captcha: { label: 'Voice Captcha', icon: UserCheck, color: 'bg-blue-100 text-blue-700 border-blue-200' },
    age_verification: { label: 'Age Verification', icon: Zap, color: 'bg-amber-100 text-amber-700 border-amber-200' },
  };
  const { label, icon: Icon, color } = config[product] || { label: product, icon: Target, color: 'bg-gray-100 text-gray-700 border-gray-200' };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border ${color}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
