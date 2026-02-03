'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Contact } from '@/types/database';
import { Sparkles, Play, CheckCircle, AlertCircle, Loader2, Tag, RefreshCw } from 'lucide-react';

export default function EnrichPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<{
    enriched: number;
    categorized: number;
    errors: string[];
  } | null>(null);
  const [categorizing, setCategorizing] = useState(false);
  const [categorizationResults, setCategorizationResults] = useState<{
    processed: number;
    categorized: number;
    breakdown: { ruleBased: number; helixSales: number; skipped: number };
  } | null>(null);
  const [uncategorizedCount, setUncategorizedCount] = useState(0);

  const supabase = createClient();

  useEffect(() => {
    loadUnenrichedContacts();
    loadUncategorizedCount();
  }, []);

  const loadUnenrichedContacts = async () => {
    setLoading(true);

    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('enriched', false)
      .eq('is_junk', false)  // Filter out junk contacts
      .order('created_at', { ascending: false });

    setContacts(data || []);
    setLoading(false);
  };

  const loadUncategorizedCount = async () => {
    const { count } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('category', 'uncategorized')
      .eq('is_junk', false);

    setUncategorizedCount(count || 0);
  };

  const handleCategorizeAll = async () => {
    setCategorizing(true);
    setCategorizationResults(null);

    try {
      const response = await fetch('/api/categorize/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 1000 }),
      });

      const result = await response.json();

      if (result.success) {
        setCategorizationResults({
          processed: result.data.processed,
          categorized: result.data.categorized,
          breakdown: result.data.breakdown,
        });
        // Refresh the count
        loadUncategorizedCount();
      }
    } catch (error) {
      console.error('Categorization failed:', error);
    }

    setCategorizing(false);
  };

  const handleEnrich = async () => {
    if (contacts.length === 0) return;

    setEnriching(true);
    setResults(null);
    setProgress({ current: 0, total: contacts.length });

    const errors: string[] = [];
    let enrichedCount = 0;
    let categorizedCount = 0;

    // Process in batches of 10
    const batchSize = 10;

    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);

      const response = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactIds: batch.map((c) => c.id),
        }),
      });

      const result = await response.json();

      if (result.success) {
        enrichedCount += result.enriched || 0;
        categorizedCount += result.categorized || 0;
      } else {
        errors.push(result.error || 'Unknown error');
      }

      setProgress({ current: Math.min(i + batchSize, contacts.length), total: contacts.length });
    }

    setResults({
      enriched: enrichedCount,
      categorized: categorizedCount,
      errors,
    });

    setEnriching(false);
    loadUnenrichedContacts();
  };

  const stats = {
    total: contacts.length,
    withEmail: contacts.filter((c) => c.email).length,
    withLinkedIn: contacts.filter((c) => c.linkedin_url).length,
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Enrich Contacts</h1>
        <p className="text-gray-600 mt-1">
          Pull work history from People Data Labs and auto-categorize contacts
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-gray-600">Unenriched contacts</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-3xl font-bold text-gray-900">{stats.withEmail}</p>
          <p className="text-gray-600">With email (best match)</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-3xl font-bold text-gray-900">{stats.withLinkedIn}</p>
          <p className="text-gray-600">With LinkedIn URL</p>
        </div>
      </div>

      {/* Enrichment Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Enrichment Process
            </h2>
            <p className="text-gray-600 mt-1">
              For each contact, we&apos;ll:
            </p>
            <ol className="mt-2 text-sm text-gray-600 space-y-1">
              <li>1. Look up the person in People Data Labs by email or LinkedIn</li>
              <li>2. Pull their full work history</li>
              <li>3. Auto-categorize as VC, Angel, Sales Prospect, or Irrelevant</li>
              <li>4. Calculate an initial proximity score</li>
            </ol>
          </div>
        </div>

        {/* Progress */}
        {enriching && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Enriching contacts...
              </span>
              <span className="text-sm text-gray-500">
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-purple-500 h-2 rounded-full transition-all"
                style={{
                  width: `${(progress.current / progress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              results.errors.length === 0
                ? 'bg-green-50 border border-green-200'
                : 'bg-yellow-50 border border-yellow-200'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle
                className={`w-5 h-5 ${
                  results.errors.length === 0 ? 'text-green-500' : 'text-yellow-500'
                }`}
              />
              <span
                className={`font-medium ${
                  results.errors.length === 0 ? 'text-green-800' : 'text-yellow-800'
                }`}
              >
                Enrichment complete
              </span>
            </div>
            <div className="text-sm space-y-1">
              <p className={results.errors.length === 0 ? 'text-green-700' : 'text-yellow-700'}>
                {results.enriched} contacts enriched
              </p>
              <p className={results.errors.length === 0 ? 'text-green-700' : 'text-yellow-700'}>
                {results.categorized} contacts categorized
              </p>
            </div>
            {results.errors.length > 0 && (
              <div className="mt-2 pt-2 border-t border-yellow-200">
                <p className="text-sm text-yellow-800 font-medium">Errors:</p>
                <ul className="text-sm text-yellow-700 space-y-1">
                  {results.errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleEnrich}
          disabled={enriching || stats.total === 0}
          className="flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {enriching ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Enriching...
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              Start Enrichment ({stats.total} contacts)
            </>
          )}
        </button>

        {stats.total === 0 && !loading && (
          <p className="mt-4 text-sm text-gray-500">
            All contacts have been enriched. Import more contacts to continue.
          </p>
        )}

        {/* PDL Credit Warning */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium">PDL API Credits</p>
              <p className="mt-1">
                Each enrichment uses 1 PDL credit. The free tier includes 100
                lookups/month. Check your usage at{' '}
                <a
                  href="https://dashboard.peopledatalabs.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  dashboard.peopledatalabs.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Categorization Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 mt-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
            <Tag className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">
              Categorize Contacts
            </h2>
            <p className="text-gray-600 mt-1">
              Run rule-based categorization on {uncategorizedCount.toLocaleString()} uncategorized contacts.
              This identifies VCs, Angels, and Sales Prospects based on job titles and company data.
            </p>
          </div>
        </div>

        {/* Categorization Results */}
        {categorizationResults && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="font-medium text-green-800">
                Categorization complete
              </span>
            </div>
            <div className="text-sm text-green-700 space-y-1">
              <p>Processed {categorizationResults.processed} contacts</p>
              <p className="font-semibold">Categorized {categorizationResults.categorized}:</p>
              <ul className="ml-4 list-disc">
                <li>{categorizationResults.breakdown.ruleBased} by rules (VC, Angel)</li>
                <li>{categorizationResults.breakdown.helixSales} as Helix sales prospects</li>
                <li>{categorizationResults.breakdown.skipped} still uncategorized (need more data)</li>
              </ul>
            </div>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleCategorizeAll}
          disabled={categorizing || uncategorizedCount === 0}
          className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {categorizing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Categorizing...
            </>
          ) : (
            <>
              <RefreshCw className="w-5 h-5" />
              Categorize All ({uncategorizedCount.toLocaleString()} contacts)
            </>
          )}
        </button>

        {uncategorizedCount === 0 && !loading && (
          <p className="mt-4 text-sm text-gray-500">
            All contacts have been categorized. Great job!
          </p>
        )}
      </div>
    </div>
  );
}
