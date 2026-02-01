import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { success, errors, withErrorHandling } from '@/lib/api';

// Patterns for junk contacts to remove
const JUNK_EMAIL_PATTERNS = [
  // Generic mailboxes
  /^(admin|info|contact|support|help|sales|hello|team|careers|jobs|hr|press|media|marketing|partnerships|billing|accounts|finance|legal|privacy|security|abuse|webmaster|postmaster|feedback|enquiries|inquiries|general|office|reception|projects)@/i,
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
  // Marketing trackers
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
  /\.gov$/i,
  /\.gov\./i,
  /senate\./i,
  /congress\./i,
  /^mailinator\./i,
  /^guerrillamail\./i,
  /^tempmail\./i,
  /^10minutemail\./i,
];

function isJunkEmail(email: string): boolean {
  if (!email) return false;
  for (const pattern of JUNK_EMAIL_PATTERNS) {
    if (pattern.test(email)) return true;
  }
  const domain = email.split('@')[1];
  if (domain) {
    for (const pattern of JUNK_DOMAIN_PATTERNS) {
      if (pattern.test(domain)) return true;
    }
  }
  return false;
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

interface CleanupPreviewData {
  total_contacts: number;
  junk_count: number;
  keep_count: number;
  junk_contacts: Array<{
    id: string;
    email: string;
    full_name: string;
    company: string;
    reason: string;
  }>;
}

interface CleanupResultData {
  message: string;
  deleted: number;
}

// GET: Preview what would be deleted
export async function GET() {
  return withErrorHandling(async () => {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return errors.unauthorized();
    }

    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return errors.notFound('Team');
    }

    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, email, full_name, company_name, job_title')
      .eq('team_id', membership.team_id);

    if (error) {
      return errors.internal(error.message);
    }

    const junkContacts = contacts?.filter((c) => isJunkEmail(c.email)) || [];
    const keepContacts = contacts?.filter((c) => !isJunkEmail(c.email)) || [];

    return success<CleanupPreviewData>({
      total_contacts: contacts?.length || 0,
      junk_count: junkContacts.length,
      keep_count: keepContacts.length,
      junk_contacts: junkContacts.map((c) => ({
        id: c.id,
        email: c.email,
        full_name: c.full_name,
        company: c.company_name,
        reason: getJunkReason(c.email),
      })),
    });
  });
}

// POST: Actually delete junk contacts
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return errors.unauthorized();
    }

    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id, role')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return errors.notFound('Team');
    }

    if (membership.role !== 'admin') {
      return errors.forbidden();
    }

    const body = await request.json();
    const { contactIds, deleteAll } = body;

    const adminClient = createAdminClient();

    if (deleteAll) {
      const { data: contacts } = await adminClient
        .from('contacts')
        .select('id, email')
        .eq('team_id', membership.team_id);

      const junkIds = contacts?.filter((c) => isJunkEmail(c.email)).map((c) => c.id) || [];

      if (junkIds.length === 0) {
        return success<CleanupResultData>({ message: 'No junk contacts to delete', deleted: 0 });
      }

      const { error } = await adminClient.from('contacts').delete().in('id', junkIds);

      if (error) {
        return errors.internal(error.message);
      }

      return success<CleanupResultData>({
        message: 'Junk contacts deleted',
        deleted: junkIds.length,
      });
    }

    if (contactIds && contactIds.length > 0) {
      const { error } = await adminClient
        .from('contacts')
        .delete()
        .eq('team_id', membership.team_id)
        .in('id', contactIds);

      if (error) {
        return errors.internal(error.message);
      }

      return success<CleanupResultData>({
        message: 'Contacts deleted',
        deleted: contactIds.length,
      });
    }

    return errors.badRequest('Provide contactIds or set deleteAll: true');
  });
}
