'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Contact, Category, WorkHistory, HelixProduct } from '@/types/database';
import {
  Search,
  Filter,
  ChevronDown,
  ExternalLink,
  Mail,
  Building,
  Briefcase,
  X,
  Target,
  Zap,
  Shield,
  UserCheck,
} from 'lucide-react';

const CATEGORIES: { value: Category | 'all'; label: string; color: string }[] = [
  { value: 'all', label: 'All Contacts', color: 'gray' },
  { value: 'vc', label: 'VCs', color: 'purple' },
  { value: 'angel', label: 'Angels', color: 'blue' },
  { value: 'sales_prospect', label: 'Sales Prospects', color: 'green' },
  { value: 'uncategorized', label: 'Uncategorized', color: 'yellow' },
  { value: 'irrelevant', label: 'Irrelevant', color: 'gray' },
];

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [workHistory, setWorkHistory] = useState<WorkHistory[]>([]);

  const supabase = createClient();

  useEffect(() => {
    loadContacts();
  }, [categoryFilter]);

  const loadContacts = async () => {
    setLoading(true);

    let query = supabase
      .from('contacts')
      .select('*')
      .order('proximity_score', { ascending: false });

    if (categoryFilter !== 'all') {
      query = query.eq('category', categoryFilter);
    }

    const { data, error } = await query;

    if (!error && data) {
      setContacts(data);
    }

    setLoading(false);
  };

  const loadWorkHistory = async (contactId: string) => {
    const { data } = await supabase
      .from('work_history')
      .select('*')
      .eq('contact_id', contactId)
      .order('is_current', { ascending: false })
      .order('start_date', { ascending: false });

    setWorkHistory(data || []);
  };

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    loadWorkHistory(contact.id);
  };

  const handleUpdateCategory = async (contactId: string, category: Category) => {
    await supabase
      .from('contacts')
      .update({ category, category_source: 'manual' })
      .eq('id', contactId);

    setContacts((prev) =>
      prev.map((c) =>
        c.id === contactId ? { ...c, category, category_source: 'manual' as const } : c
      )
    );

    if (selectedContact?.id === contactId) {
      setSelectedContact((prev) =>
        prev ? { ...prev, category, category_source: 'manual' as const } : null
      );
    }
  };

  const filteredContacts = contacts.filter((c) =>
    search
      ? c.full_name.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase()) ||
        c.current_company?.toLowerCase().includes(search.toLowerCase())
      : true
  );

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Contact List */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-600 mt-1">
            {filteredContacts.length} contacts
            {categoryFilter !== 'all' && ` in ${categoryFilter}`}
          </p>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
          <div className="relative">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as Category | 'all')}
              className="appearance-none pl-4 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Contact List */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No contacts found</div>
          ) : (
            <div className="overflow-y-auto h-full">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                      Company
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredContacts.map((contact) => (
                    <tr
                      key={contact.id}
                      onClick={() => handleSelectContact(contact)}
                      className={`hover:bg-gray-50 cursor-pointer ${
                        selectedContact?.id === contact.id ? 'bg-primary-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900">
                            {contact.full_name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {contact.current_title || 'No title'}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {contact.current_company || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <CategoryBadge category={contact.category} />
                      </td>
                      <td className="px-4 py-3">
                        <ProximityScore score={contact.proximity_score} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Contact Detail Panel */}
      {selectedContact && (
        <div className="w-96 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {selectedContact.full_name}
                </h2>
                <p className="text-gray-600 mt-1">
                  {selectedContact.current_title || 'No title'}
                </p>
              </div>
              <button
                onClick={() => setSelectedContact(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {/* Contact Info */}
            <div className="space-y-4 mb-6">
              {selectedContact.email && (
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-gray-400" />
                  <a
                    href={`mailto:${selectedContact.email}`}
                    className="text-primary-600 hover:underline"
                  >
                    {selectedContact.email}
                  </a>
                </div>
              )}
              {selectedContact.current_company && (
                <div className="flex items-center gap-3">
                  <Building className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-700">
                    {selectedContact.current_company}
                  </span>
                </div>
              )}
              {selectedContact.linkedin_url && (
                <div className="flex items-center gap-3">
                  <ExternalLink className="w-5 h-5 text-gray-400" />
                  <a
                    href={selectedContact.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:underline"
                  >
                    LinkedIn Profile
                  </a>
                </div>
              )}
            </div>

            {/* Category Selector */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.filter((c) => c.value !== 'all').map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() =>
                      handleUpdateCategory(selectedContact.id, cat.value as Category)
                    }
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      selectedContact.category === cat.value
                        ? `badge-${cat.value}`
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              {/* Category Reason */}
              {selectedContact.category_reason && (
                <p className="mt-2 text-xs text-gray-500 italic">
                  {selectedContact.category_reason}
                </p>
              )}
            </div>

            {/* Helix Sales Intel */}
            {selectedContact.category === 'sales_prospect' && selectedContact.helix_products && selectedContact.helix_products.length > 0 && (
              <div className="mb-6 p-4 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
                <label className="flex items-center gap-2 text-sm font-medium text-emerald-800 mb-3">
                  <Target className="w-4 h-4" />
                  Helix Product Fit
                </label>
                <div className="flex flex-wrap gap-2">
                  {selectedContact.helix_products.map((product) => (
                    <HelixProductBadge key={product} product={product} />
                  ))}
                </div>
              </div>
            )}

            {/* Proximity Score */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Proximity Score
              </label>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-primary-500 h-3 rounded-full"
                    style={{ width: `${selectedContact.proximity_score}%` }}
                  />
                </div>
                <span className="font-semibold text-gray-900">
                  {selectedContact.proximity_score}
                </span>
              </div>
            </div>

            {/* Work History */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Briefcase className="w-4 h-4 inline mr-1" />
                Work History
              </label>
              {workHistory.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {selectedContact.enriched
                    ? 'No work history found'
                    : 'Not yet enriched'}
                </p>
              ) : (
                <div className="space-y-3">
                  {workHistory.map((job) => (
                    <div
                      key={job.id}
                      className="p-3 bg-gray-50 rounded-lg text-sm"
                    >
                      <p className="font-medium text-gray-900">{job.title}</p>
                      <p className="text-gray-600">{job.company_name}</p>
                      <p className="text-gray-400 text-xs mt-1">
                        {job.start_date
                          ? new Date(job.start_date).getFullYear()
                          : '?'}{' '}
                        -{' '}
                        {job.is_current
                          ? 'Present'
                          : job.end_date
                          ? new Date(job.end_date).getFullYear()
                          : '?'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryBadge({ category }: { category: Category }) {
  const labels: Record<Category, string> = {
    vc: 'VC',
    angel: 'Angel',
    sales_prospect: 'Prospect',
    irrelevant: 'Irrelevant',
    uncategorized: 'Uncategorized',
  };

  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium badge-${category}`}>
      {labels[category]}
    </span>
  );
}

function ProximityScore({ score }: { score: number }) {
  let color = 'text-gray-400';
  if (score >= 70) color = 'text-green-600';
  else if (score >= 40) color = 'text-yellow-600';
  else if (score > 0) color = 'text-orange-500';

  return <span className={`font-semibold ${color}`}>{score}</span>;
}

function HelixProductBadge({ product }: { product: string }) {
  const productConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    captcha_replacement: {
      label: 'Captcha Replacement',
      icon: <Shield className="w-3 h-3" />,
      color: 'bg-purple-100 text-purple-700 border-purple-200',
    },
    voice_captcha: {
      label: 'Voice Captcha',
      icon: <UserCheck className="w-3 h-3" />,
      color: 'bg-blue-100 text-blue-700 border-blue-200',
    },
    age_verification: {
      label: 'Age Verification',
      icon: <Zap className="w-3 h-3" />,
      color: 'bg-amber-100 text-amber-700 border-amber-200',
    },
  };

  const config = productConfig[product] || {
    label: product,
    icon: <Target className="w-3 h-3" />,
    color: 'bg-gray-100 text-gray-700 border-gray-200',
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border ${config.color}`}>
      {config.icon}
      {config.label}
    </span>
  );
}
