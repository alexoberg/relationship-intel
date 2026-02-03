'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Sparkles,
  Users,
  Target,
  ChevronDown,
  ExternalLink,
  Plus,
  Check,
  X,
  Loader2,
  ArrowRight,
  Building,
  Shield,
  UserCheck,
  Zap,
  RefreshCw,
  Download,
  AlertCircle,
  CheckCircle,
  Info,
} from 'lucide-react';
import Link from 'next/link';

interface SeedProspect {
  id: string;
  company_name: string;
  company_domain: string;
  company_industry: string | null;
  helix_fit_score: number | null;
  helix_fit_reason: string | null;
  helix_products: string[] | null;
}

interface LookalikeCompany {
  company_name: string;
  company_domain: string;
  company_industry: string;
  company_size?: string;
  funding_stage?: string;
  description: string;
  helix_fit_score: number;
  helix_fit_reason: string;
  helix_products: string[];
  similarity_reason: string;
}

interface LookalikeResponse {
  seeds: {
    count: number;
    min_score: number;
    companies: string[];
    common_industries: string[];
    common_products: string[];
  };
  lookalikes: LookalikeCompany[];
  added_count?: number;
  added_prospects?: { id: string; company_name: string }[];
}

export default function LookalikePage() {
  const [seedProspects, setSeedProspects] = useState<SeedProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Configuration
  const [minScore, setMinScore] = useState(80);
  const [count, setCount] = useState(20);

  // Results
  const [lookalikes, setLookalikes] = useState<LookalikeCompany[]>([]);
  const [selectedLookalikes, setSelectedLookalikes] = useState<Set<string>>(new Set());
  const [seedAnalysis, setSeedAnalysis] = useState<LookalikeResponse['seeds'] | null>(null);

  // Status
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    loadSeedProspects();
  }, [minScore]);

  const loadSeedProspects = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('prospects')
      .select('id, company_name, company_domain, company_industry, helix_fit_score, helix_fit_reason, helix_products')
      .gte('helix_fit_score', minScore)
      .order('helix_fit_score', { ascending: false })
      .limit(20);

    if (!error && data) {
      setSeedProspects(data);
    }
    setLoading(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setSuccessMessage(null);
    setLookalikes([]);
    setSelectedLookalikes(new Set());

    try {
      const response = await fetch(`/api/prospects/lookalike?min_score=${minScore}&count=${count}`);
      const data: LookalikeResponse = await response.json();

      if (!response.ok) {
        throw new Error((data as { error?: string }).error || 'Failed to generate lookalikes');
      }

      setLookalikes(data.lookalikes);
      setSeedAnalysis(data.seeds);
      // Select all by default
      setSelectedLookalikes(new Set(data.lookalikes.map(l => l.company_domain)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate lookalikes');
    }

    setGenerating(false);
  };

  const handleSaveSelected = async () => {
    if (selectedLookalikes.size === 0) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const selectedCompanies = lookalikes.filter(l => selectedLookalikes.has(l.company_domain));
    let savedCount = 0;

    for (const company of selectedCompanies) {
      try {
        const response = await fetch('/api/prospects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add-by-domain',
            companyName: company.company_name,
            domain: company.company_domain,
          }),
        });

        if (response.ok) {
          savedCount++;
          // Remove from lookalikes list
          setLookalikes(prev => prev.filter(l => l.company_domain !== company.company_domain));
          setSelectedLookalikes(prev => {
            const next = new Set(prev);
            next.delete(company.company_domain);
            return next;
          });
        }
      } catch {
        // Continue with next
      }
    }

    setSaving(false);
    if (savedCount > 0) {
      setSuccessMessage(`Added ${savedCount} prospects successfully!`);
      // Refresh seed prospects
      loadSeedProspects();
    }
  };

  const toggleSelect = (domain: string) => {
    setSelectedLookalikes(prev => {
      const next = new Set(prev);
      if (next.has(domain)) {
        next.delete(domain);
      } else {
        next.add(domain);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedLookalikes(new Set(lookalikes.map(l => l.company_domain)));
  };

  const selectNone = () => {
    setSelectedLookalikes(new Set());
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl text-white">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Lookalike Audience</h1>
            <p className="text-gray-600">Find similar companies to your best prospects</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Seed Prospects & Config */}
        <div className="col-span-1 space-y-6">
          {/* Configuration */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-600" />
              Configuration
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum Helix Fit Score
                </label>
                <select
                  value={minScore}
                  onChange={(e) => setMinScore(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                >
                  <option value={90}>90+ (Top tier only)</option>
                  <option value={80}>80+ (Recommended)</option>
                  <option value={70}>70+ (Good fit)</option>
                  <option value={60}>60+ (Moderate fit)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Higher scores = more targeted lookalikes
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Lookalikes
                </label>
                <select
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                >
                  <option value={10}>10 companies</option>
                  <option value={20}>20 companies</option>
                  <option value={30}>30 companies</option>
                  <option value={50}>50 companies (max)</option>
                </select>
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating || seedProspects.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg shadow-purple-500/25"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate Lookalikes
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Seed Prospects */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-green-600" />
              Seed Companies ({seedProspects.length})
            </h2>

            {loading ? (
              <div className="py-8 text-center text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                Loading...
              </div>
            ) : seedProspects.length === 0 ? (
              <div className="py-8 text-center">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
                <p className="text-gray-600 font-medium">No high-scoring prospects</p>
                <p className="text-sm text-gray-500 mt-1">
                  You need prospects with score {'>='} {minScore} to generate lookalikes
                </p>
                <Link
                  href="/dashboard/prospects"
                  className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-700 text-sm mt-3"
                >
                  Go to Prospects <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {seedProspects.map((prospect) => (
                  <div
                    key={prospect.id}
                    className="p-3 bg-gray-50 rounded-lg border border-gray-100"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">{prospect.company_name}</p>
                        <p className="text-xs text-gray-500">{prospect.company_domain}</p>
                      </div>
                      <span className="text-sm font-bold text-green-600 ml-2">
                        {prospect.helix_fit_score}
                      </span>
                    </div>
                    {prospect.helix_products && prospect.helix_products.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {prospect.helix_products.map((product) => (
                          <ProductBadgeSmall key={product} product={product} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Seed Analysis */}
          {seedAnalysis && (
            <div className="bg-purple-50 rounded-xl border border-purple-200 p-6">
              <h3 className="text-sm font-semibold text-purple-800 mb-3 flex items-center gap-2">
                <Info className="w-4 h-4" />
                Seed Profile Analysis
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-purple-600">Common Industries:</span>
                  <span className="ml-2 text-purple-900">
                    {seedAnalysis.common_industries.join(', ') || 'Various'}
                  </span>
                </div>
                <div>
                  <span className="text-purple-600">Common Products:</span>
                  <span className="ml-2 text-purple-900">
                    {seedAnalysis.common_products.map(p => productLabel(p)).join(', ') || 'Various'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Lookalike Results */}
        <div className="col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Results Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Lookalike Companies
                  {lookalikes.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({selectedLookalikes.size} of {lookalikes.length} selected)
                    </span>
                  )}
                </h2>
              </div>

              {lookalikes.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <button
                      onClick={selectAll}
                      className="text-purple-600 hover:text-purple-700"
                    >
                      Select all
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      onClick={selectNone}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      Clear
                    </button>
                  </div>
                  <button
                    onClick={handleSaveSelected}
                    disabled={saving || selectedLookalikes.size === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Add {selectedLookalikes.size} as Prospects
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Status Messages */}
            {error && (
              <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {successMessage && (
              <div className="mx-4 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">{successMessage}</span>
              </div>
            )}

            {/* Results Content */}
            <div className="p-4">
              {generating ? (
                <div className="py-16 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 rounded-full mb-4">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                  </div>
                  <p className="text-gray-600 font-medium">Analyzing seed companies...</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Finding similar companies using AI
                  </p>
                </div>
              ) : lookalikes.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                    <Sparkles className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-600 font-medium">No lookalikes generated yet</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Configure your settings and click "Generate Lookalikes"
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 max-h-[600px] overflow-y-auto">
                  {lookalikes.map((company) => (
                    <LookalikeCard
                      key={company.company_domain}
                      company={company}
                      selected={selectedLookalikes.has(company.company_domain)}
                      onToggle={() => toggleSelect(company.company_domain)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LookalikeCard({
  company,
  selected,
  onToggle,
}: {
  company: LookalikeCompany;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={onToggle}
      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
        selected
          ? 'border-purple-500 bg-purple-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 truncate">{company.company_name}</h3>
            <a
              href={`https://${company.company_domain}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-gray-400 hover:text-gray-600"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
          <p className="text-sm text-gray-500">{company.company_domain}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-green-600">{company.helix_fit_score}</span>
          <div
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
              selected
                ? 'border-purple-500 bg-purple-500 text-white'
                : 'border-gray-300 bg-white'
            }`}
          >
            {selected && <Check className="w-4 h-4" />}
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-600 mb-3 line-clamp-2">{company.description}</p>

      <div className="flex flex-wrap gap-1 mb-3">
        {company.helix_products.map((product) => (
          <ProductBadgeSmall key={product} product={product} />
        ))}
        {company.company_industry && (
          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
            {company.company_industry}
          </span>
        )}
        {company.funding_stage && (
          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded capitalize">
            {company.funding_stage.replace('_', ' ')}
          </span>
        )}
      </div>

      <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
        <span className="font-medium text-gray-600">Why similar:</span>{' '}
        {company.similarity_reason}
      </div>
    </div>
  );
}

function ProductBadgeSmall({ product }: { product: string }) {
  const config: Record<string, { label: string; icon: typeof Shield; color: string }> = {
    captcha_replacement: { label: 'Bot', icon: Shield, color: 'bg-purple-100 text-purple-700' },
    bot_sorter: { label: 'Bot', icon: Shield, color: 'bg-purple-100 text-purple-700' },
    voice_captcha: { label: 'Voice', icon: UserCheck, color: 'bg-blue-100 text-blue-700' },
    age_verification: { label: 'Age', icon: Zap, color: 'bg-amber-100 text-amber-700' },
  };
  const { label, icon: Icon, color } = config[product] || { label: product, icon: Target, color: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function productLabel(product: string): string {
  const labels: Record<string, string> = {
    captcha_replacement: 'Bot Sorter',
    bot_sorter: 'Bot Sorter',
    voice_captcha: 'Voice Captcha',
    age_verification: 'Age Verification',
  };
  return labels[product] || product;
}
