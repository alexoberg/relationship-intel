'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Search,
  Filter,
  ChevronDown,
  ExternalLink,
  Building,
  Users,
  X,
  Target,
  Zap,
  Shield,
  UserCheck,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Upload,
  TrendingUp,
  Link as LinkIcon,
  Calendar,
  DollarSign,
  Sparkles,
} from 'lucide-react';

interface Prospect {
  id: string;
  team_id: string;
  company_name: string;
  company_domain: string;
  company_industry: string | null;
  company_size: string | null;
  company_linkedin_url: string | null;
  company_website: string | null;
  company_description: string | null;
  funding_stage: string | null;
  last_funding_date: string | null;
  last_funding_amount: number | null;
  total_funding: number | null;
  helix_products: string[];
  helix_fit_score: number;
  helix_fit_reason: string | null;
  helix_target_titles: string[];
  connection_score: number;
  has_warm_intro: boolean;
  best_connector: string | null;
  connection_type: string | null;
  connection_context: string | null;
  connections_count: number;
  priority_score: number;
  status: string;
  is_good_fit: boolean | null;
  feedback_notes: string | null;
  source: string;
  created_at: string;
}

interface ProspectConnection {
  id: string;
  prospect_id: string;
  target_name: string;
  target_title: string | null;
  target_linkedin_url: string | null;
  target_email: string | null;
  connector_name: string;
  connection_type: string;
  connection_strength: number;
  shared_context: string | null;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'new', label: 'New' },
  { value: 'researching', label: 'Researching' },
  { value: 'reaching_out', label: 'Reaching Out' },
  { value: 'in_conversation', label: 'In Conversation' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'not_a_fit', label: 'Not a Fit' },
];

const HELIX_PRODUCTS = [
  { value: 'captcha_replacement', label: 'Bot Sorter', icon: Shield },
  { value: 'voice_captcha', label: 'Voice Captcha', icon: UserCheck },
  { value: 'age_verification', label: 'Age Verification', icon: Zap },
];

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [connections, setConnections] = useState<ProspectConnection[]>([]);
  const [feedbackNotes, setFeedbackNotes] = useState('');

  const supabase = createClient();

  useEffect(() => {
    loadProspects();
  }, [statusFilter, productFilter]);

  const loadProspects = async () => {
    setLoading(true);

    let query = supabase
      .from('prospects')
      .select('*')
      .order('priority_score', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    if (productFilter) {
      query = query.contains('helix_products', [productFilter]);
    }

    const { data, error } = await query;

    if (!error && data) {
      setProspects(data);
    }

    setLoading(false);
  };

  const loadConnections = async (prospectId: string) => {
    const { data } = await supabase
      .from('prospect_connections')
      .select('*')
      .eq('prospect_id', prospectId)
      .order('connection_strength', { ascending: false });

    setConnections(data || []);
  };

  const handleSelectProspect = (prospect: Prospect) => {
    setSelectedProspect(prospect);
    setFeedbackNotes(prospect.feedback_notes || '');
    loadConnections(prospect.id);
  };

  const handleUpdateStatus = async (prospectId: string, status: string) => {
    await supabase
      .from('prospects')
      .update({ status })
      .eq('id', prospectId);

    setProspects((prev) =>
      prev.map((p) => (p.id === prospectId ? { ...p, status } : p))
    );

    if (selectedProspect?.id === prospectId) {
      setSelectedProspect((prev) => (prev ? { ...prev, status } : null));
    }
  };

  const handleFeedback = async (prospectId: string, isGoodFit: boolean) => {
    await supabase
      .from('prospects')
      .update({ 
        is_good_fit: isGoodFit, 
        feedback_notes: feedbackNotes,
        status: isGoodFit ? 'researching' : 'not_a_fit'
      })
      .eq('id', prospectId);

    setProspects((prev) =>
      prev.map((p) =>
        p.id === prospectId
          ? { ...p, is_good_fit: isGoodFit, feedback_notes: feedbackNotes, status: isGoodFit ? 'researching' : 'not_a_fit' }
          : p
      )
    );

    if (selectedProspect?.id === prospectId) {
      setSelectedProspect((prev) =>
        prev ? { ...prev, is_good_fit: isGoodFit, feedback_notes: feedbackNotes, status: isGoodFit ? 'researching' : 'not_a_fit' } : null
      );
    }
  };

  const handleImportSeed = async () => {
    setImporting(true);
    try {
      const response = await fetch('/api/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import-seed' }),
      });
      if (response.ok) {
        await loadProspects();
      }
    } catch (error) {
      console.error('Import failed:', error);
    }
    setImporting(false);
  };

  const handleSyncConnections = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync-swarm' }),
      });
      if (response.ok) {
        await loadProspects();
      }
    } catch (error) {
      console.error('Sync failed:', error);
    }
    setSyncing(false);
  };

  const filteredProspects = prospects.filter((p) =>
    search
      ? p.company_name.toLowerCase().includes(search.toLowerCase()) ||
        p.company_domain.toLowerCase().includes(search.toLowerCase())
      : true
  );

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Prospect List */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Helix Prospects</h1>
            <p className="text-gray-600 mt-1">
              {filteredProspects.length} companies ranked by fit + connections
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleImportSeed}
              disabled={importing}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {importing ? 'Importing...' : 'Import Seed'}
            </button>
            <button
              onClick={handleSyncConnections}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Connections'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search companies..."
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
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          <div className="flex gap-2">
            {HELIX_PRODUCTS.map((product) => (
              <button
                key={product.value}
                onClick={() => setProductFilter(productFilter === product.value ? null : product.value)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  productFilter === product.value
                    ? 'bg-primary-100 text-primary-700 border border-primary-300'
                    : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <product.icon className="w-4 h-4" />
                {product.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prospects Table */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : filteredProspects.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Target className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="font-medium">No prospects yet</p>
              <p className="text-sm mt-1">Click "Import Seed" to load target companies</p>
            </div>
          ) : (
            <div className="overflow-y-auto h-full">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Company</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Products</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Helix Fit</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Connections</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Priority</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProspects.map((prospect) => (
                    <tr
                      key={prospect.id}
                      onClick={() => handleSelectProspect(prospect)}
                      className={`hover:bg-gray-50 cursor-pointer ${
                        selectedProspect?.id === prospect.id ? 'bg-primary-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900">{prospect.company_name}</p>
                          <p className="text-sm text-gray-500">{prospect.company_domain}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {prospect.helix_products?.map((p) => (
                            <HelixProductIcon key={p} product={p} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <ScoreBadge score={prospect.helix_fit_score} label="Fit" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ScoreBadge score={prospect.connection_score} label="Conn" />
                          {prospect.has_warm_intro && (
                            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Warm</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <PriorityBadge score={prospect.priority_score} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={prospect.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Prospect Detail Panel */}
      {selectedProspect && (
        <div className="w-[420px] bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{selectedProspect.company_name}</h2>
                <a
                  href={`https://${selectedProspect.company_domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline text-sm flex items-center gap-1 mt-1"
                >
                  {selectedProspect.company_domain}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <button onClick={() => setSelectedProspect(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Priority Score */}
            <div className="p-4 bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl border border-primary-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-primary-800">Priority Score</span>
                <span className="text-2xl font-bold text-primary-700">{selectedProspect.priority_score}</span>
              </div>
              <div className="flex gap-4 text-xs">
                <div>
                  <span className="text-primary-600">Helix Fit:</span>
                  <span className="ml-1 font-semibold">{selectedProspect.helix_fit_score}</span>
                </div>
                <div>
                  <span className="text-primary-600">Connections:</span>
                  <span className="ml-1 font-semibold">{selectedProspect.connection_score}</span>
                </div>
              </div>
            </div>

            {/* Helix Products */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Target className="w-4 h-4 inline mr-1" />
                Helix Product Fit
              </label>
              <div className="flex flex-wrap gap-2">
                {selectedProspect.helix_products?.map((product) => (
                  <HelixProductBadge key={product} product={product} />
                ))}
              </div>
              {selectedProspect.helix_fit_reason && (
                <p className="mt-2 text-sm text-gray-600 italic">{selectedProspect.helix_fit_reason}</p>
              )}
            </div>

            {/* Best Connection */}
            {selectedProspect.best_connector && (
              <div className="p-4 bg-green-50 rounded-xl border border-green-200">
                <label className="block text-sm font-medium text-green-800 mb-2">
                  <LinkIcon className="w-4 h-4 inline mr-1" />
                  Best Path In
                </label>
                <p className="font-medium text-green-900">{selectedProspect.best_connector}</p>
                {selectedProspect.connection_context && (
                  <p className="text-sm text-green-700 mt-1">{selectedProspect.connection_context}</p>
                )}
                <p className="text-xs text-green-600 mt-2">
                  {selectedProspect.connections_count} total connections found
                </p>
              </div>
            )}

            {/* Connections List */}
            {connections.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Users className="w-4 h-4 inline mr-1" />
                  Connection Paths ({connections.length})
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {connections.map((conn) => (
                    <div key={conn.id} className="p-3 bg-gray-50 rounded-lg text-sm">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-gray-900">{conn.target_name}</p>
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                          {Math.round(conn.connection_strength * 100)}%
                        </span>
                      </div>
                      <p className="text-gray-600 text-xs">{conn.target_title}</p>
                      <p className="text-primary-600 text-xs mt-1">
                        via {conn.connector_name} ({conn.connection_type})
                      </p>
                      {conn.shared_context && (
                        <p className="text-gray-500 text-xs mt-1 italic">{conn.shared_context}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Funding Info */}
            {selectedProspect.funding_stage && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <DollarSign className="w-4 h-4 inline mr-1" />
                  Funding
                </label>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-900 capitalize">{selectedProspect.funding_stage.replace('_', ' ')}</p>
                  {selectedProspect.total_funding && (
                    <p className="text-sm text-gray-600">
                      ${(selectedProspect.total_funding / 1000000).toFixed(1)}M total raised
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={selectedProspect.status}
                onChange={(e) => handleUpdateStatus(selectedProspect.id, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                {STATUS_OPTIONS.filter(s => s.value !== 'all').map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Feedback */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Sparkles className="w-4 h-4 inline mr-1" />
                Feedback (helps improve scoring)
              </label>
              <textarea
                value={feedbackNotes}
                onChange={(e) => setFeedbackNotes(e.target.value)}
                placeholder="Notes about this prospect..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none h-20 text-sm"
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleFeedback(selectedProspect.id, true)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    selectedProspect.is_good_fit === true
                      ? 'bg-green-600 text-white'
                      : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                  }`}
                >
                  <ThumbsUp className="w-4 h-4" />
                  Good Fit
                </button>
                <button
                  onClick={() => handleFeedback(selectedProspect.id, false)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    selectedProspect.is_good_fit === false
                      ? 'bg-red-600 text-white'
                      : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                  }`}
                >
                  <ThumbsDown className="w-4 h-4" />
                  Not a Fit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function HelixProductIcon({ product }: { product: string }) {
  const config: Record<string, { icon: typeof Shield; color: string }> = {
    captcha_replacement: { icon: Shield, color: 'text-purple-600' },
    voice_captcha: { icon: UserCheck, color: 'text-blue-600' },
    age_verification: { icon: Zap, color: 'text-amber-600' },
  };
  const { icon: Icon, color } = config[product] || { icon: Target, color: 'text-gray-600' };
  return <Icon className={`w-4 h-4 ${color}`} />;
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

function ScoreBadge({ score, label }: { score: number; label: string }) {
  let color = 'bg-gray-100 text-gray-600';
  if (score >= 70) color = 'bg-green-100 text-green-700';
  else if (score >= 40) color = 'bg-yellow-100 text-yellow-700';
  else if (score > 0) color = 'bg-orange-100 text-orange-700';
  return (
    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${color}`}>
      {score}
    </span>
  );
}

function PriorityBadge({ score }: { score: number }) {
  let color = 'bg-gray-100 text-gray-600 border-gray-200';
  let icon = null;
  if (score >= 70) {
    color = 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 border-green-300';
    icon = <TrendingUp className="w-3 h-3" />;
  } else if (score >= 50) {
    color = 'bg-gradient-to-r from-yellow-100 to-amber-100 text-yellow-700 border-yellow-300';
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${color}`}>
      {icon}
      {score}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700',
    researching: 'bg-purple-100 text-purple-700',
    reaching_out: 'bg-yellow-100 text-yellow-700',
    in_conversation: 'bg-green-100 text-green-700',
    won: 'bg-emerald-100 text-emerald-700',
    lost: 'bg-gray-100 text-gray-500',
    not_a_fit: 'bg-red-100 text-red-700',
  };
  const labels: Record<string, string> = {
    new: 'New',
    researching: 'Researching',
    reaching_out: 'Reaching Out',
    in_conversation: 'In Conversation',
    won: 'Won',
    lost: 'Lost',
    not_a_fit: 'Not a Fit',
  };
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${config[status] || config.new}`}>
      {labels[status] || status}
    </span>
  );
}
