import { inngest } from '../client';
import { createAdminClient } from '@/lib/supabase/admin';
import Anthropic from '@anthropic-ai/sdk';

const BATCH_SIZE = 5;

/**
 * Sync warm intro connections from contacts to prospects
 * Matches by domain and company name
 */
export const syncWarmIntros = inngest.createFunction(
  {
    id: 'sync-warm-intros',
    name: 'Sync Warm Intros',
    concurrency: { limit: 1, key: 'event.data.teamId' },
    retries: 2,
  },
  { event: 'prospects/sync-warm-intros' },
  async ({ event, step }) => {
    const { teamId } = event.data;
    const supabase = createAdminClient();

    // Step 1: Get all prospects
    const prospects = await step.run('get-prospects', async () => {
      const { data } = await supabase
        .from('prospects')
        .select('id, company_name, company_domain')
        .eq('team_id', teamId);
      return data || [];
    });

    // Step 2: Get all contacts with job history
    const contacts = await step.run('get-contacts', async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, full_name, current_company, company_domain, job_history, best_connector, connection_strength, linkedin_url, email')
        .eq('team_id', teamId);
      return data || [];
    });

    // Step 3: Build lookup maps
    const maps = await step.run('build-lookup-maps', async () => {
      const currentDomainMap = new Map<string, any[]>();
      const historyDomainMap = new Map<string, any[]>();
      const companyNameMap = new Map<string, any[]>();

      for (const c of contacts) {
        // Current domain
        if (c.company_domain) {
          const domain = c.company_domain.toLowerCase().replace(/^www\./, '');
          if (!currentDomainMap.has(domain)) currentDomainMap.set(domain, []);
          currentDomainMap.get(domain)!.push({ ...c, matchType: 'current_employee' });
        }

        // Current company name
        if (c.current_company) {
          const name = c.current_company.toLowerCase().trim();
          if (!companyNameMap.has(name)) companyNameMap.set(name, []);
          companyNameMap.get(name)!.push({ ...c, matchType: 'current_employee' });
        }

        // Job history
        for (const job of (c.job_history || [])) {
          if (job.domain) {
            const domain = job.domain.toLowerCase().replace(/^www\./, '');
            if (!historyDomainMap.has(domain)) historyDomainMap.set(domain, []);
            historyDomainMap.get(domain)!.push({ ...c, job, matchType: job.is_current ? 'current_employee' : 'alumni' });
          }
          if (job.company) {
            const name = job.company.toLowerCase().trim();
            if (!companyNameMap.has(name)) companyNameMap.set(name, []);
            companyNameMap.get(name)!.push({ ...c, job, matchType: job.is_current ? 'current_employee' : 'alumni' });
          }
        }
      }

      return {
        currentDomainMap: Object.fromEntries(currentDomainMap),
        historyDomainMap: Object.fromEntries(historyDomainMap),
        companyNameMap: Object.fromEntries(companyNameMap),
      };
    });

    // Step 4: Clear existing connections
    await step.run('clear-connections', async () => {
      await supabase.from('prospect_connections').delete().eq('team_id', teamId);
    });

    // Step 5: Match prospects to contacts
    let totalConnections = 0;
    let prospectsWithConnections = 0;

    for (let i = 0; i < prospects.length; i++) {
      const prospect = prospects[i];

      await step.run(`match-prospect-${i}`, async () => {
        const matches = new Map<string, any>();
        const prospectDomain = prospect.company_domain?.toLowerCase().replace(/^www\./, '');
        const prospectName = prospect.company_name?.toLowerCase().trim();

        // Match by current company domain
        if (prospectDomain && maps.currentDomainMap[prospectDomain]) {
          for (const m of maps.currentDomainMap[prospectDomain]) {
            if (!matches.has(m.id) || m.matchType === 'current_employee') {
              matches.set(m.id, m);
            }
          }
        }

        // Match by job history domain
        if (prospectDomain && maps.historyDomainMap[prospectDomain]) {
          for (const m of maps.historyDomainMap[prospectDomain]) {
            if (!matches.has(m.id)) {
              matches.set(m.id, m);
            }
          }
        }

        // Match by company name
        if (prospectName && maps.companyNameMap[prospectName]) {
          for (const m of maps.companyNameMap[prospectName]) {
            if (!matches.has(m.id)) {
              matches.set(m.id, m);
            }
          }
        }

        if (matches.size === 0) return;
        prospectsWithConnections++;

        // Insert connections
        const insertData = [];
        for (const [contactId, m] of matches) {
          insertData.push({
            prospect_id: prospect.id,
            team_id: teamId,
            target_name: m.full_name,
            target_title: m.job?.title || m.current_company,
            target_linkedin_url: m.linkedin_url,
            target_email: m.email,
            connector_name: m.best_connector || 'Network',
            relationship_type: m.matchType,
            relationship_strength: Math.round((m.connection_strength || 0.5) * 100),
            connection_context: m.matchType === 'current_employee'
              ? `Currently works at ${prospect.company_name}`
              : `Previously worked at ${prospect.company_name}`,
          });
        }

        await supabase.from('prospect_connections').insert(insertData);
        totalConnections += insertData.length;

        // Update prospect
        const currentCount = insertData.filter(d => d.relationship_type === 'current_employee').length;
        const alumniCount = insertData.filter(d => d.relationship_type === 'alumni').length;

        await supabase.from('prospects').update({
          has_warm_intro: true,
          connections_count: matches.size,
          best_connector: insertData[0]?.connector_name,
          connection_context: `${currentCount} current, ${alumniCount} alumni`,
        }).eq('id', prospect.id);
      });
    }

    return {
      status: 'success',
      prospectsProcessed: prospects.length,
      prospectsWithConnections,
      totalConnections,
    };
  }
);

/**
 * AI-powered Helix product fit scoring
 */
export const scoreHelixFit = inngest.createFunction(
  {
    id: 'score-helix-fit',
    name: 'Score Helix Product Fit',
    concurrency: { limit: 1, key: 'event.data.teamId' },
    retries: 2,
  },
  { event: 'prospects/score-helix-fit' },
  async ({ event, step }) => {
    const { teamId } = event.data;
    const supabase = createAdminClient();
    const anthropic = new Anthropic();

    // Get prospects needing scoring
    const prospects = await step.run('get-prospects', async () => {
      const { data } = await supabase
        .from('prospects')
        .select('*')
        .eq('team_id', teamId)
        .or('helix_fit_reason.is.null,helix_fit_reason.eq.');
      return data || [];
    });

    if (prospects.length === 0) {
      return { status: 'complete', message: 'All prospects already scored' };
    }

    let processed = 0;
    let withProducts = 0;

    // Process in batches
    for (let i = 0; i < prospects.length; i += BATCH_SIZE) {
      const batch = prospects.slice(i, i + BATCH_SIZE);

      await step.run(`analyze-batch-${Math.floor(i / BATCH_SIZE)}`, async () => {
        const prospectInfo = batch.map(p => ({
          id: p.id,
          company_name: p.company_name,
          domain: p.company_domain,
          industry: p.company_industry,
          description: p.company_description || 'No description',
        }));

        const prompt = `Analyze these companies for Helix product fit:

1. **Captcha Replacement** - Bot protection replacing CAPTCHAs (e-commerce, ticketing, fintech)
2. **Voice Captcha** - Unique human verification (social platforms, marketplaces, dating)
3. **Age Verification** - Privacy-preserving age gates (gaming, gambling, adult content)

Companies: ${JSON.stringify(prospectInfo, null, 2)}

Return JSON:
{
  "results": [
    {"id": "uuid", "products": ["captcha_replacement"], "reason": "Brief explanation"}
  ]
}`;

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages: [{ role: 'user', content: prompt }],
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return;

        const results = JSON.parse(jsonMatch[0]).results;

        for (const result of results) {
          await supabase.from('prospects').update({
            helix_products: result.products || [],
            helix_fit_reason: result.reason || 'No specific Helix product fit identified',
          }).eq('id', result.id);

          processed++;
          if (result.products?.length > 0) withProducts++;
        }
      });

      // Rate limit between batches
      await step.sleep('rate-limit', '1s');
    }

    return { status: 'success', processed, withProducts };
  }
);

/**
 * Update priority scores based on helix fit and connections
 */
export const updatePriorityScores = inngest.createFunction(
  {
    id: 'update-priority-scores',
    name: 'Update Priority Scores',
    concurrency: { limit: 1, key: 'event.data.teamId' },
    retries: 2,
  },
  { event: 'prospects/update-priority-scores' },
  async ({ event, step }) => {
    const { teamId } = event.data;
    const supabase = createAdminClient();

    // Known high-value customers
    const KNOWN_CUSTOMERS = [
      'ticketmaster', 'stubhub', 'draftkings', 'fanduel', 'reddit',
      'twitter', 'x.com', 'instagram', 'tiktok', 'roblox', 'discord',
      'spotify', 'pinterest', 'onlyfans', 'twitch', 'youtube'
    ];

    const INDUSTRY_SCORES: Record<string, number> = {
      'ticketing': 20, 'events': 15, 'gaming': 20, 'gambling': 25,
      'social': 15, 'marketplace': 15, 'fintech': 15, 'e-commerce': 10, 'adult': 25,
    };

    // Get prospects and connections
    const { prospects, connections } = await step.run('get-data', async () => {
      const [{ data: p }, { data: c }] = await Promise.all([
        supabase.from('prospects').select('*').eq('team_id', teamId),
        supabase.from('prospect_connections').select('*').eq('team_id', teamId),
      ]);
      return { prospects: p || [], connections: c || [] };
    });

    // Group connections by prospect
    const connectionsByProspect = new Map<string, any[]>();
    for (const conn of connections) {
      if (!connectionsByProspect.has(conn.prospect_id)) {
        connectionsByProspect.set(conn.prospect_id, []);
      }
      connectionsByProspect.get(conn.prospect_id)!.push(conn);
    }

    let updated = 0;

    for (let i = 0; i < prospects.length; i++) {
      await step.run(`update-prospect-${i}`, async () => {
        const prospect = prospects[i];
        const conns = connectionsByProspect.get(prospect.id) || [];

        // Calculate helix_fit_score
        let helix_fit_score = 0;
        const products = prospect.helix_products || [];
        helix_fit_score += Math.min(products.length * 25, 60);

        // Known customer bonus
        const domain = (prospect.company_domain || '').toLowerCase();
        const name = (prospect.company_name || '').toLowerCase();
        if (KNOWN_CUSTOMERS.some(c => domain.includes(c) || name.includes(c))) {
          helix_fit_score += 30;
        }

        // Industry bonus
        const industry = (prospect.company_industry || '').toLowerCase();
        for (const [ind, bonus] of Object.entries(INDUSTRY_SCORES)) {
          if (industry.includes(ind)) {
            helix_fit_score += bonus;
            break;
          }
        }
        helix_fit_score = Math.min(helix_fit_score, 100);

        // Calculate connection_score
        let connection_score = 0;
        const currentEmployees = conns.filter(c => c.relationship_type === 'current_employee');
        const alumni = conns.filter(c => c.relationship_type === 'alumni');
        connection_score += Math.min(currentEmployees.length * 20 + alumni.length * 10, 80);
        if (prospect.has_warm_intro) connection_score += 20;
        connection_score = Math.min(connection_score, 100);

        await supabase.from('prospects').update({
          helix_fit_score,
          connection_score,
        }).eq('id', prospect.id);

        updated++;
      });
    }

    return { status: 'success', updated };
  }
);

// Export all functions
export const functions = [syncWarmIntros, scoreHelixFit, updatePriorityScores];
