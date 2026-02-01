import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Patterns for junk contacts to remove
const JUNK_EMAIL_PATTERNS = [
  // Generic mailboxes
  /^admin@/i,
  /^info@/i,
  /^contact@/i,
  /^support@/i,
  /^help@/i,
  /^sales@/i,
  /^hello@/i,
  /^team@/i,
  /^careers@/i,
  /^jobs@/i,
  /^hr@/i,
  /^press@/i,
  /^media@/i,
  /^marketing@/i,
  /^partnerships@/i,
  /^billing@/i,
  /^accounts@/i,
  /^finance@/i,
  /^legal@/i,
  /^privacy@/i,
  /^security@/i,
  /^abuse@/i,
  /^webmaster@/i,
  /^postmaster@/i,
  /^feedback@/i,
  /^enquiries@/i,
  /^inquiries@/i,
  /^general@/i,
  /^office@/i,
  /^reception@/i,
  /^projects@/i,

  // No-reply / automated
  /^no[-_]?reply@/i,
  /^noreply@/i,
  /^do[-_]?not[-_]?reply@/i,
  /^donotreply@/i,
  /^bounce@/i,
  /^mailer[-_]?daemon@/i,
  /^notifications?@/i,
  /^alerts?@/i,
  /^automated?@/i,
  /^system@/i,

  // Invoice/billing automation
  /invoice/i,
  /statements?@/i,
  /receipts?@/i,
  /orders?@/i,

  // Marketing trackers (plus addressing)
  /^messages\+/i,
  /\+.*@.*mktg/i,
  /\+.*@.*marketing/i,

  // Government/political
  /\.gov$/i,
  /senator\./i,
  /congressman/i,
  /representative/i,

  // Disposable/temporary
  /\+test/i,
  /\+temp/i,
  /\+spam/i,
];

const JUNK_DOMAIN_PATTERNS = [
  // Government
  /\.gov$/i,
  /\.gov\./i,
  /senate\./i,
  /congress\./i,

  // Public email providers (often not business contacts)
  /^mailinator\./i,
  /^guerrillamail\./i,
  /^tempmail\./i,
  /^10minutemail\./i,
];

function isJunkEmail(email: string): boolean {
  if (!email) return false;

  // Check email patterns
  for (const pattern of JUNK_EMAIL_PATTERNS) {
    if (pattern.test(email)) return true;
  }

  // Check domain patterns
  const domain = email.split('@')[1];
  if (domain) {
    for (const pattern of JUNK_DOMAIN_PATTERNS) {
      if (pattern.test(domain)) return true;
    }
  }

  return false;
}

// GET: Preview what would be deleted
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get user's team
  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 });
  }

  // Get all contacts
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, email, full_name, company_name, job_title')
    .eq('team_id', membership.team_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Find junk contacts
  const junkContacts = contacts?.filter(c => isJunkEmail(c.email)) || [];
  const keepContacts = contacts?.filter(c => !isJunkEmail(c.email)) || [];

  return NextResponse.json({
    total_contacts: contacts?.length || 0,
    junk_count: junkContacts.length,
    keep_count: keepContacts.length,
    junk_contacts: junkContacts.map(c => ({
      id: c.id,
      email: c.email,
      full_name: c.full_name,
      company: c.company_name,
      reason: getJunkReason(c.email),
    })),
  });
}

function getJunkReason(email: string): string {
  if (!email) return 'empty email';

  for (const pattern of JUNK_EMAIL_PATTERNS) {
    if (pattern.test(email)) {
      if (/^(admin|info|contact|support|help|hello|team)@/i.test(email)) return 'generic mailbox';
      if (/^no[-_]?reply|^do[-_]?not[-_]?reply/i.test(email)) return 'no-reply address';
      if (/invoice|statement|receipt|order/i.test(email)) return 'automated billing';
      if (/^messages\+|\+.*@.*mktg/i.test(email)) return 'marketing tracker';
      if (/senator|congressman|\.gov/i.test(email)) return 'political/government';
      if (/notification|alert|automated|system/i.test(email)) return 'automated system';
      return 'junk pattern match';
    }
  }

  const domain = email.split('@')[1];
  if (domain) {
    for (const pattern of JUNK_DOMAIN_PATTERNS) {
      if (pattern.test(domain)) return 'junk domain';
    }
  }

  return 'unknown';
}

// POST: Actually delete junk contacts
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get user's team
  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 });
  }

  // Only admins can delete contacts
  if (membership.role !== 'admin') {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
  }

  const body = await request.json();
  const { contactIds, deleteAll } = body;

  const adminClient = createAdminClient();

  if (deleteAll) {
    // Get all contacts, filter to junk, delete
    const { data: contacts } = await adminClient
      .from('contacts')
      .select('id, email')
      .eq('team_id', membership.team_id);

    const junkIds = contacts?.filter(c => isJunkEmail(c.email)).map(c => c.id) || [];

    if (junkIds.length === 0) {
      return NextResponse.json({ message: 'No junk contacts to delete', deleted: 0 });
    }

    const { error } = await adminClient
      .from('contacts')
      .delete()
      .in('id', junkIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      message: 'Junk contacts deleted',
      deleted: junkIds.length,
    });
  }

  // Delete specific contacts
  if (contactIds && contactIds.length > 0) {
    const { error } = await adminClient
      .from('contacts')
      .delete()
      .eq('team_id', membership.team_id)
      .in('id', contactIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      message: 'Contacts deleted',
      deleted: contactIds.length,
    });
  }

  return NextResponse.json({ error: 'Provide contactIds or set deleteAll: true' }, { status: 400 });
}
