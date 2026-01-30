import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import {
  Users,
  TrendingUp,
  Sparkles,
  Target,
  Upload,
  ArrowRight,
} from 'lucide-react';

export default async function DashboardPage() {
  const supabase = await createClient();

  // Get contact stats
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, category, enriched, proximity_score');

  const stats = {
    total: contacts?.length || 0,
    enriched: contacts?.filter((c) => c.enriched).length || 0,
    vc: contacts?.filter((c) => c.category === 'vc').length || 0,
    angel: contacts?.filter((c) => c.category === 'angel').length || 0,
    sales_prospect: contacts?.filter((c) => c.category === 'sales_prospect').length || 0,
    uncategorized: contacts?.filter((c) => c.category === 'uncategorized').length || 0,
    avgProximity:
      contacts && contacts.length > 0
        ? Math.round(
            contacts.reduce((sum, c) => sum + (c.proximity_score || 0), 0) /
              contacts.length
          )
        : 0,
  };

  const hasContacts = stats.total > 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">
          Your network intelligence at a glance
        </p>
      </div>

      {!hasContacts ? (
        // Empty state
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Upload className="w-8 h-8 text-primary-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Get started by importing your network
          </h2>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Upload your LinkedIn connections CSV to start building your
            relationship intelligence database.
          </p>
          <Link
            href="/dashboard/import"
            className="inline-flex items-center gap-2 bg-primary-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors"
          >
            Import Contacts <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard
              title="Total Contacts"
              value={stats.total}
              icon={Users}
              color="blue"
            />
            <StatCard
              title="Enriched"
              value={stats.enriched}
              subtitle={`${Math.round((stats.enriched / stats.total) * 100)}%`}
              icon={Sparkles}
              color="purple"
            />
            <StatCard
              title="Avg Proximity"
              value={stats.avgProximity}
              subtitle="out of 100"
              icon={TrendingUp}
              color="green"
            />
            <StatCard
              title="Uncategorized"
              value={stats.uncategorized}
              icon={Target}
              color="yellow"
            />
          </div>

          {/* Category Breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Contact Categories
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <CategoryCard
                label="VCs"
                count={stats.vc}
                total={stats.total}
                color="purple"
              />
              <CategoryCard
                label="Angels"
                count={stats.angel}
                total={stats.total}
                color="blue"
              />
              <CategoryCard
                label="Sales Prospects"
                count={stats.sales_prospect}
                total={stats.total}
                color="green"
              />
              <CategoryCard
                label="Uncategorized"
                count={stats.uncategorized}
                total={stats.total}
                color="yellow"
              />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link
              href="/dashboard/contacts"
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <h3 className="font-semibold text-gray-900 mb-2">View Contacts</h3>
              <p className="text-gray-600 text-sm">
                Browse and filter your categorized contacts
              </p>
            </Link>
            <Link
              href="/dashboard/enrich"
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <h3 className="font-semibold text-gray-900 mb-2">
                Enrich Contacts
              </h3>
              <p className="text-gray-600 text-sm">
                Pull work history and auto-categorize
              </p>
            </Link>
            <Link
              href="/dashboard/connect"
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <h3 className="font-semibold text-gray-900 mb-2">
                Connect Gmail
              </h3>
              <p className="text-gray-600 text-sm">
                Sync emails and calendar for proximity scoring
              </p>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: number;
  subtitle?: string;
  icon: React.ElementType;
  color: 'blue' | 'purple' | 'green' | 'yellow';
}) {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    purple: 'bg-purple-100 text-purple-600',
    green: 'bg-green-100 text-green-600',
    yellow: 'bg-yellow-100 text-yellow-600',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
      <p className="text-sm text-gray-600">
        {title}
        {subtitle && <span className="text-gray-400 ml-1">{subtitle}</span>}
      </p>
    </div>
  );
}

function CategoryCard({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: 'purple' | 'blue' | 'green' | 'yellow';
}) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;

  const colors = {
    purple: 'bg-purple-500',
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
  };

  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm text-gray-500">{percentage}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${colors[color]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-lg font-semibold text-gray-900 mt-2">{count}</p>
    </div>
  );
}
