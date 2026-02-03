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

    // Step 2: Get all contacts with job history (exclude junk)
    const contacts = await step.run('get-contacts', async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, full_name, current_company, company_domain, job_history, best_connector, connection_strength, linkedin_url, email')
        .eq('team_id', teamId)
        .or('is_junk.is.null,is_junk.eq.false'); // Exclude junk contacts
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
 * Generates specific reasons why Helix products fit each prospect
 * Marks prospects as "not_a_fit" if no clear product fit can be identified
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

    // Get prospects needing scoring (no reason yet)
    const prospects = await step.run('get-prospects', async () => {
      const { data } = await supabase
        .from('prospects')
        .select('*')
        .eq('team_id', teamId)
        .neq('status', 'not_a_fit')
        .or('helix_fit_reason.is.null,helix_fit_reason.eq.');
      return data || [];
    });

    if (prospects.length === 0) {
      return { status: 'complete', message: 'All prospects already scored' };
    }

    let processed = 0;
    let withFit = 0;
    let markedNotFit = 0;

    // Process in batches
    for (let i = 0; i < prospects.length; i += BATCH_SIZE) {
      const batch = prospects.slice(i, i + BATCH_SIZE);

      await step.run(`analyze-batch-${Math.floor(i / BATCH_SIZE)}`, async () => {
        const prospectInfo = batch.map(p => ({
          id: p.id,
          company_name: p.company_name,
          domain: p.company_domain,
          industry: p.company_industry,
          description: p.description || p.company_description || 'No description',
        }));

        const prompt = `You are evaluating companies for Helix's identity verification products. Be specific about WHY each product fits.

HELIX PRODUCTS:
1. **Bot Sorter** - Replaces CAPTCHAs with frictionless bot detection. Best for: ticketing (anti-scalping), e-commerce (checkout fraud), account creation flows
2. **Voice Captcha** - Unique voice-based human verification. Best for: social platforms (fake account prevention), dating apps (authenticity), marketplaces (trust)
3. **Age Verification** - Privacy-preserving age gates without collecting DOB. Best for: gaming (age-gated content), gambling, alcohol/cannabis, adult content

CRITICAL REQUIREMENTS FROM SALES TEAM FEEDBACK:
1. **US-based companies ONLY** - Reject non-US headquartered companies
2. **Must be actively operating** - Check if company is defunct/bankrupt/shutdown
3. **Consumer platforms only** - REJECT: B2B SaaS, dev tools, agencies, service businesses, enterprise software
4. **No "creator tools"** - Tools FOR creators are different from platforms WITH creators (reject the former)

HIGH PRIORITY VERTICALS (score 80+):
- Prediction markets / betting platforms (Polymarket, Kalshi-style)
- Collectibles / trading card marketplaces (sports cards, trading cards)
- Messaging apps with spam problems
- Age-gated content platforms (adult content, gambling, cannabis)
- Gaming platforms (especially with child safety/COPPA needs)
- Ticketing platforms (scalping prevention)
- Dating apps (authenticity verification)
- Social networks with bot/fake account problems

MEDIUM PRIORITY (score 60-79):
- Gig economy / freelance marketplaces
- E-commerce with limited drops / hype releases
- Travel platforms (scraping/price manipulation)
- Streaming platforms

LOW PRIORITY / LIKELY REJECT:
- Mega-tech (Meta, Google) - too big, won't buy from startup
- Pure B2B / enterprise software
- Dev tools / APIs / infrastructure
- Marketing agencies / creative studios
- Non-US based companies
- Defunct / bankrupt companies

For each company, determine:
- Which specific Helix product(s) fit and WHY (be specific about the use case)
- Score 1-100 based on priority level above
- If NO clear fit or fails critical requirements, set is_fit to false

Companies: ${JSON.stringify(prospectInfo, null, 2)}

Return JSON:
{
  "results": [
    {
      "id": "uuid",
      "is_fit": true,
      "score": 85,
      "products": ["bot_sorter"],
      "reason": "Specific explanation of why this product fits their business"
    }
  ]
}

Be STRICT - reject companies that don't meet critical requirements.`;

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
          if (result.is_fit === false) {
            // Mark as not a fit - remove from active prospects
            await supabase.from('prospects').update({
              status: 'not_a_fit',
              helix_fit_reason: 'No clear Helix product fit identified',
              helix_fit_score: 0,
              helix_products: [],
            }).eq('id', result.id);
            markedNotFit++;
          } else {
            // Map product names to our internal format
            const products = (result.products || []).map((p: string) => {
              const lower = p.toLowerCase();
              if (lower.includes('bot') || lower.includes('captcha_replacement')) return 'captcha_replacement';
              if (lower.includes('voice')) return 'voice_captcha';
              if (lower.includes('age')) return 'age_verification';
              return p;
            });

            await supabase.from('prospects').update({
              helix_products: products,
              helix_fit_reason: result.reason,
            }).eq('id', result.id);
            withFit++;
          }
          processed++;
        }
      });

      // Rate limit between batches
      await step.sleep('rate-limit', '1s');
    }

    return { status: 'success', processed, withFit, markedNotFit };
  }
);

/**
 * Update priority scores based on connections and company size
 * NOTE: Does NOT overwrite helix_fit_score - that comes from manual CSV import or AI scoring
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

    // Funding stage indicates company size - smaller = easier to sell into
    // Higher score = more accessible (seed/series_a easier than public)
    const FUNDING_STAGE_SCORES: Record<string, number> = {
      'seed': 25,
      'series_a': 20,
      'series_b': 15,
      'series_c': 10,
      'series_d': 8,
      'series_e': 5,
      'series_f': 3,
      'series_g': 2,
      'public': 0,
      'acquired': 0,
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

        // Calculate connection_score based on network connections
        let connection_score = 0;
        const currentEmployees = conns.filter(c => c.relationship_type === 'current_employee');
        const alumni = conns.filter(c => c.relationship_type === 'alumni');
        connection_score += Math.min(currentEmployees.length * 20 + alumni.length * 10, 80);
        if (prospect.has_warm_intro) connection_score += 20;
        connection_score = Math.min(connection_score, 100);

        // Calculate priority_score: helix_fit (kept from CSV) + connection + size accessibility
        const helixFit = prospect.helix_fit_score || 0;
        const fundingStage = (prospect.funding_stage || '').toLowerCase();
        const sizeBonus = FUNDING_STAGE_SCORES[fundingStage] || 10; // default 10 for unknown

        // Priority = weighted combination (helix fit most important, then connections, then size)
        // helix_fit: 0-100 (50% weight)
        // connection_score: 0-100 (35% weight)
        // size accessibility: 0-25 (15% weight, normalized to 0-100)
        const priority_score = Math.round(
          (helixFit * 0.5) +
          (connection_score * 0.35) +
          ((sizeBonus / 25) * 100 * 0.15)
        );

        // Only update connection_score and priority_score, preserve helix_fit_score
        await supabase.from('prospects').update({
          connection_score,
          priority_score: Math.min(priority_score, 100),
        }).eq('id', prospect.id);

        updated++;
      });
    }

    return { status: 'success', updated };
  }
);

/**
 * Learn from user feedback to improve AI scoring
 * Analyzes patterns in user-confirmed good/bad fits to update scoring prompts
 */
export const learnFromFeedback = inngest.createFunction(
  {
    id: 'learn-from-feedback',
    name: 'Learn From Feedback',
    concurrency: { limit: 1, key: 'event.data.teamId' },
    retries: 2,
  },
  { event: 'prospects/learn-from-feedback' },
  async ({ event, step }) => {
    const { teamId, minFeedbackCount = 20 } = event.data;
    const supabase = createAdminClient();
    const anthropic = new Anthropic();

    // Step 1: Get all feedback with prospect details
    const feedback = await step.run('get-feedback', async () => {
      const { data } = await supabase
        .from('prospect_feedback')
        .select(`
          *,
          prospect:prospects (
            company_name,
            company_domain,
            company_industry,
            company_description,
            funding_stage,
            helix_products,
            helix_fit_score,
            helix_fit_reason
          )
        `)
        .eq('team_id', teamId);
      return data || [];
    });

    if (feedback.length < minFeedbackCount) {
      return {
        status: 'insufficient_data',
        message: `Need at least ${minFeedbackCount} feedback items, have ${feedback.length}`,
        feedbackCount: feedback.length,
      };
    }

    // Step 2: Analyze feedback patterns
    const analysis = await step.run('analyze-patterns', async () => {
      const goodFits = feedback.filter(f => f.is_good_fit);
      const notFits = feedback.filter(f => !f.is_good_fit);

      // Group by AI score accuracy
      const aiAccurate = feedback.filter(f =>
        (f.ai_helix_fit_score >= 50 && f.is_good_fit) ||
        (f.ai_helix_fit_score < 50 && !f.is_good_fit)
      );
      const aiWrong = feedback.filter(f =>
        (f.ai_helix_fit_score >= 50 && !f.is_good_fit) ||
        (f.ai_helix_fit_score < 50 && f.is_good_fit)
      );

      // Extract patterns from user-confirmed good fits
      const goodFitExamples = goodFits.slice(0, 10).map(f => ({
        company: f.prospect?.company_name,
        domain: f.prospect?.company_domain,
        industry: f.prospect?.company_industry,
        funding: f.prospect?.funding_stage,
        products: f.ai_helix_products,
        aiReason: f.ai_helix_fit_reason,
        userReason: f.feedback_reason,
      }));

      // Extract patterns from user-rejected (AI was wrong)
      const notFitExamples = notFits.slice(0, 10).map(f => ({
        company: f.prospect?.company_name,
        domain: f.prospect?.company_domain,
        industry: f.prospect?.company_industry,
        funding: f.prospect?.funding_stage,
        products: f.ai_helix_products,
        aiReason: f.ai_helix_fit_reason,
        userReason: f.feedback_reason,
      }));

      return {
        totalFeedback: feedback.length,
        goodFits: goodFits.length,
        notFits: notFits.length,
        aiAccuracy: Math.round((aiAccurate.length / feedback.length) * 100),
        goodFitExamples,
        notFitExamples,
      };
    });

    // Step 3: Generate improved scoring guidance using Claude
    const learnings = await step.run('generate-learnings', async () => {
      const prompt = `Analyze this user feedback on prospect qualification and identify patterns to improve future AI scoring.

CONTEXT: Users are qualifying prospects for Helix's identity verification products:
- Bot Sorter: Replaces CAPTCHAs (ticketing, e-commerce, account creation)
- Voice Captcha: Voice-based human verification (social platforms, dating apps, marketplaces)
- Age Verification: Privacy-preserving age gates (gaming, gambling, alcohol/cannabis)

FEEDBACK SUMMARY:
- Total feedback: ${analysis.totalFeedback}
- User confirmed good fits: ${analysis.goodFits}
- User rejected as not fits: ${analysis.notFits}
- Current AI accuracy: ${analysis.aiAccuracy}%

USER-CONFIRMED GOOD FITS (AI should learn to identify these):
${JSON.stringify(analysis.goodFitExamples, null, 2)}

USER-REJECTED PROSPECTS (AI incorrectly scored these as good fits):
${JSON.stringify(analysis.notFitExamples, null, 2)}

Based on this feedback, provide:

1. PATTERNS TO PRIORITIZE: What types of companies/industries users consistently approve
2. PATTERNS TO AVOID: What types of companies/industries users consistently reject
3. FALSE POSITIVE PATTERNS: Where AI overestimates fit (user rejects high AI scores)
4. FALSE NEGATIVE PATTERNS: Where AI underestimates fit (user approves low AI scores)
5. IMPROVED SCORING CRITERIA: Specific guidance to add to future scoring prompts

Return JSON:
{
  "patterns": {
    "prioritize": ["pattern1", "pattern2"],
    "avoid": ["pattern1", "pattern2"],
    "falsePositives": ["description of common mistakes"],
    "falseNegatives": ["description of missed opportunities"]
  },
  "scoringGuidance": "A paragraph of specific guidance to add to future scoring prompts based on user feedback patterns",
  "industryWeights": {
    "industry_name": "increase/decrease/neutral",
    ...
  }
}`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { error: 'Failed to parse learnings' };
      }

      return JSON.parse(jsonMatch[0]);
    });

    // Step 4: Store learnings for future scoring runs
    await step.run('store-learnings', async () => {
      // Store learnings in a team settings table or similar
      // For now, we'll log it and it can be used to update the scoring prompt
      await supabase
        .from('team_settings')
        .upsert({
          team_id: teamId,
          key: 'ai_scoring_learnings',
          value: {
            learnings,
            analysis: {
              totalFeedback: analysis.totalFeedback,
              aiAccuracy: analysis.aiAccuracy,
              lastUpdated: new Date().toISOString(),
            },
          },
        }, {
          onConflict: 'team_id,key',
        });
    });

    // Step 5: Re-score unreviewed prospects with improved criteria
    const unreviewed = await step.run('get-unreviewed', async () => {
      const { data } = await supabase
        .from('prospects')
        .select('id, company_name, company_domain, company_industry, company_description')
        .eq('team_id', teamId)
        .is('reviewed_at', null)
        .neq('status', 'not_a_fit')
        .limit(50);
      return data || [];
    });

    if (unreviewed.length > 0 && learnings.scoringGuidance) {
      // Process in batches with improved guidance
      for (let i = 0; i < unreviewed.length; i += BATCH_SIZE) {
        const batch = unreviewed.slice(i, i + BATCH_SIZE);

        await step.run(`rescore-batch-${Math.floor(i / BATCH_SIZE)}`, async () => {
          const prospectInfo = batch.map(p => ({
            id: p.id,
            company_name: p.company_name,
            domain: p.company_domain,
            industry: p.company_industry,
            description: p.company_description || 'No description',
          }));

          const prompt = `You are evaluating companies for Helix's identity verification products.

HELIX PRODUCTS:
1. **Bot Sorter** - Replaces CAPTCHAs with frictionless bot detection. Best for: ticketing (anti-scalping), e-commerce (checkout fraud), account creation flows
2. **Voice Captcha** - Unique voice-based human verification. Best for: social platforms (fake account prevention), dating apps (authenticity), marketplaces (trust)
3. **Age Verification** - Privacy-preserving age gates without collecting DOB. Best for: gaming (age-gated content), gambling, alcohol/cannabis, adult content

IMPORTANT LEARNINGS FROM USER FEEDBACK:
${learnings.scoringGuidance}

Patterns to prioritize: ${(learnings.patterns?.prioritize || []).join(', ')}
Patterns to avoid: ${(learnings.patterns?.avoid || []).join(', ')}

Companies to evaluate:
${JSON.stringify(prospectInfo, null, 2)}

For each company, determine:
- Which specific Helix product(s) fit and WHY (be specific about the use case)
- Apply the learnings from user feedback
- If NO clear fit exists, set is_fit to false

Return JSON:
{
  "results": [
    {
      "id": "uuid",
      "is_fit": true,
      "score": 75,
      "products": ["bot_sorter"],
      "reason": "Specific explanation incorporating user feedback learnings"
    }
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
            if (result.is_fit === false) {
              await supabase.from('prospects').update({
                status: 'not_a_fit',
                helix_fit_reason: 'No clear Helix product fit (re-scored with user learnings)',
                helix_fit_score: 0,
                helix_products: [],
              }).eq('id', result.id);
            } else {
              const products = (result.products || []).map((p: string) => {
                const lower = p.toLowerCase();
                if (lower.includes('bot') || lower.includes('captcha_replacement')) return 'captcha_replacement';
                if (lower.includes('voice')) return 'voice_captcha';
                if (lower.includes('age')) return 'age_verification';
                return p;
              });

              await supabase.from('prospects').update({
                helix_products: products,
                helix_fit_score: result.score || 70,
                helix_fit_reason: result.reason,
              }).eq('id', result.id);
            }
          }
        });

        await step.sleep('rate-limit', '1s');
      }
    }

    return {
      status: 'success',
      analysis: {
        totalFeedback: analysis.totalFeedback,
        aiAccuracy: analysis.aiAccuracy,
        goodFits: analysis.goodFits,
        notFits: analysis.notFits,
      },
      learnings: learnings.patterns,
      rescored: unreviewed.length,
    };
  }
);

/**
 * Check if a domain is reachable/exists
 * Returns false if domain doesn't resolve or returns error
 */
async function checkDomainExists(domain: string): Promise<{ exists: boolean; redirectedTo?: string }> {
  if (!domain) return { exists: false };

  // Clean up domain
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(`https://${cleanDomain}`, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    // Check if we got redirected to a different domain (could indicate acquisition/pivot)
    const finalUrl = response.url;
    const finalDomain = new URL(finalUrl).hostname.replace(/^www\./, '');

    if (finalDomain !== cleanDomain && !finalDomain.includes(cleanDomain)) {
      return { exists: true, redirectedTo: finalDomain };
    }

    return { exists: response.ok || response.status < 500 };
  } catch (error: any) {
    // Try HTTP as fallback
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://${cleanDomain}`, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeout);
      return { exists: response.ok || response.status < 500 };
    } catch {
      return { exists: false };
    }
  }
}

/**
 * Verify domains exist and mark dead ones
 * Checks actual domain resolution, not just a static list
 */
export const verifyProspectDomains = inngest.createFunction(
  {
    id: 'verify-prospect-domains',
    name: 'Verify Prospect Domains',
    concurrency: { limit: 1, key: 'event.data.teamId' },
    retries: 1,
  },
  { event: 'prospects/verify-domains' },
  async ({ event, step }) => {
    const { teamId, batchSize = 50 } = event.data;
    const supabase = createAdminClient();

    // Get prospects with domains that haven't been verified recently
    const prospects = await step.run('get-prospects', async () => {
      const { data } = await supabase
        .from('prospects')
        .select('id, company_name, company_domain')
        .eq('team_id', teamId)
        .neq('status', 'not_a_fit')
        .not('company_domain', 'is', null)
        .order('created_at', { ascending: true })
        .limit(batchSize);
      return data || [];
    });

    let deadDomains = 0;
    let redirectedDomains = 0;
    let validDomains = 0;

    // Check domains in batches to avoid rate limits
    for (let i = 0; i < prospects.length; i += 10) {
      const batch = prospects.slice(i, i + 10);

      await step.run(`check-batch-${Math.floor(i / 10)}`, async () => {
        const results = await Promise.all(
          batch.map(async (p) => {
            const result = await checkDomainExists(p.company_domain);
            return { prospect: p, ...result };
          })
        );

        for (const { prospect, exists, redirectedTo } of results) {
          if (!exists) {
            // Domain doesn't exist - mark as not a fit
            await supabase.from('prospects').update({
              status: 'not_a_fit',
              helix_fit_reason: `Domain ${prospect.company_domain} no longer exists - company may be defunct`,
              helix_fit_score: 0,
            }).eq('id', prospect.id);
            deadDomains++;
          } else if (redirectedTo) {
            // Domain redirects elsewhere - update the domain
            await supabase.from('prospects').update({
              company_domain: redirectedTo,
              helix_fit_reason: `Domain redirected from ${prospect.company_domain} to ${redirectedTo}`,
            }).eq('id', prospect.id);
            redirectedDomains++;
          } else {
            validDomains++;
          }
        }
      });

      // Rate limit between batches
      if (i + 10 < prospects.length) {
        await step.sleep('rate-limit', '2s');
      }
    }

    return {
      status: 'success',
      checked: prospects.length,
      deadDomains,
      redirectedDomains,
      validDomains,
    };
  }
);

/**
 * Clean up dead/defunct companies and verify data quality
 * - Eliminates known dead companies
 * - Ensures all active prospects have helix_fit_reason and helix_products
 * - Verifies and fixes connection counts
 */
export const cleanupProspects = inngest.createFunction(
  {
    id: 'cleanup-prospects',
    name: 'Cleanup Prospects',
    concurrency: { limit: 1, key: 'event.data.teamId' },
    retries: 2,
  },
  { event: 'prospects/cleanup' },
  async ({ event, step }) => {
    const { teamId } = event.data;
    const supabase = createAdminClient();
    const anthropic = new Anthropic();

    // Known dead/defunct companies
    const DEAD_COMPANIES = [
      'vine', 'quibi', 'mixer', 'google+', 'googleplus', 'blab', 'meerkat',
      'periscope', 'houseparty', 'yik yak', 'yikyak', 'secret', 'path',
      'friendster', 'myspace', 'digg', 'stumbleupon', 'del.icio.us', 'delicious',
      'foursquare city guide', 'rdio', 'grooveshark', 'songza', 'turntable.fm',
      'google wave', 'google reader', 'posterous', 'formspring', 'friendfeed',
    ];

    // Step 1: Get learnings for scoring
    const learnings = await step.run('get-learnings', async () => {
      const { data: settings } = await supabase
        .from('team_settings')
        .select('value')
        .eq('team_id', teamId)
        .eq('key', 'ai_scoring_learnings')
        .single();
      return settings?.value?.learnings;
    });

    // Step 2: Mark dead companies
    const deadCount = await step.run('mark-dead-companies', async () => {
      const { data: allProspects } = await supabase
        .from('prospects')
        .select('id, company_name, company_domain')
        .eq('team_id', teamId)
        .neq('status', 'not_a_fit');

      let count = 0;
      for (const p of allProspects || []) {
        const nameLower = p.company_name.toLowerCase();
        const domainLower = p.company_domain?.toLowerCase() || '';

        if (DEAD_COMPANIES.some(d => nameLower.includes(d) || domainLower.includes(d))) {
          await supabase.from('prospects').update({
            status: 'not_a_fit',
            helix_fit_reason: 'Company is defunct/shut down',
            helix_fit_score: 0,
          }).eq('id', p.id);
          count++;
        }
      }
      return count;
    });

    // Step 3: Get prospects needing scoring
    const needsScoring = await step.run('get-needs-scoring', async () => {
      const { data } = await supabase
        .from('prospects')
        .select('id, company_name, company_domain, company_industry, company_description, helix_products')
        .eq('team_id', teamId)
        .neq('status', 'not_a_fit')
        .or('helix_fit_reason.is.null,helix_products.is.null,helix_products.eq.{}');
      return data || [];
    });

    // Step 4: Score prospects in batches
    let scored = 0;
    let eliminated = 0;

    for (let i = 0; i < needsScoring.length; i += BATCH_SIZE) {
      const batch = needsScoring.slice(i, i + BATCH_SIZE);

      await step.run(`score-batch-${Math.floor(i / BATCH_SIZE)}`, async () => {
        const prospectInfo = batch.map(p => ({
          id: p.id,
          company_name: p.company_name,
          domain: p.company_domain,
          industry: p.company_industry || 'Unknown',
          description: p.company_description || 'No description',
        }));

        const prompt = `You are evaluating companies for Helix's identity verification products.

HELIX PRODUCTS:
1. Bot Sorter (captcha_replacement) - Replaces CAPTCHAs. Best for: ticketing, e-commerce, account creation
2. Voice Captcha (voice_captcha) - Voice-based verification. Best for: social platforms, dating apps, marketplaces
3. Age Verification (age_verification) - Privacy-preserving age gates. Best for: gaming, gambling, alcohol/cannabis

CRITICAL REQUIREMENTS - REJECT IF ANY FAIL:
1. **US-based companies ONLY** - Non-US headquartered = reject
2. **Must be actively operating** - Defunct/bankrupt = reject
3. **Consumer platforms only** - B2B SaaS, dev tools, agencies = reject
4. **No "creator tools"** - Tools FOR creators ≠ platforms WITH creators

HIGH PRIORITY (score 80+): Prediction markets, collectibles marketplaces, messaging apps, age-gated content, gaming platforms, ticketing, dating, social networks
MEDIUM PRIORITY (score 60-79): Gig economy, e-commerce drops, travel, streaming
LIKELY REJECT: Mega-tech, B2B/enterprise, dev tools, agencies, non-US, defunct

USER LEARNINGS TO APPLY:
${learnings?.scoringGuidance || 'Prioritize mid-market consumer companies. Prediction markets and collectibles marketplaces are TOP priority.'}

Companies:
${JSON.stringify(prospectInfo, null, 2)}

Return JSON:
{
  "results": [
    {
      "id": "uuid",
      "is_fit": true,
      "is_dead": false,
      "score": 70,
      "products": ["captcha_replacement", "voice_captcha"],
      "reason": "Specific reason why Helix products fit this company"
    }
  ]
}

IMPORTANT: products array must use exact values: captcha_replacement, voice_captcha, age_verification`;

        try {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4000,
            messages: [{ role: 'user', content: prompt }],
          });

          const text = response.content[0].type === 'text' ? response.content[0].text : '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);

          if (jsonMatch) {
            const results = JSON.parse(jsonMatch[0]).results;

            for (const result of results) {
              if (result.is_fit === false || result.is_dead === true) {
                await supabase.from('prospects').update({
                  status: 'not_a_fit',
                  helix_fit_score: 0,
                  helix_fit_reason: result.is_dead ? 'Company appears defunct' : (result.reason || 'No clear Helix fit'),
                  helix_products: [],
                }).eq('id', result.id);
                eliminated++;
              } else {
                const products = (result.products || []).map((p: string) => {
                  const lower = p.toLowerCase();
                  if (lower.includes('bot') || lower === 'captcha_replacement') return 'captcha_replacement';
                  if (lower.includes('voice') || lower === 'voice_captcha') return 'voice_captcha';
                  if (lower.includes('age') || lower === 'age_verification') return 'age_verification';
                  return null;
                }).filter(Boolean);

                await supabase.from('prospects').update({
                  helix_fit_score: result.score || 60,
                  helix_fit_reason: result.reason,
                  helix_products: products.length > 0 ? products : ['captcha_replacement'],
                }).eq('id', result.id);
                scored++;
              }
            }
          }
        } catch (err: any) {
          console.error(`Batch error: ${err.message}`);
        }
      });

      await step.sleep('rate-limit', '1s');
    }

    // Step 5: Verify connections
    const connectionStats = await step.run('verify-connections', async () => {
      // Get all prospect_connections
      const { data: connections } = await supabase
        .from('prospect_connections')
        .select('id, prospect_id')
        .limit(5000);

      // Get all valid prospect IDs (active prospects only)
      const { data: validProspects } = await supabase
        .from('prospects')
        .select('id')
        .eq('team_id', teamId)
        .neq('status', 'not_a_fit');

      const validProspectIds = new Set((validProspects || []).map(p => p.id));

      // Find and delete orphaned connections
      let orphanedCount = 0;
      for (const conn of connections || []) {
        if (!validProspectIds.has(conn.prospect_id)) {
          await supabase.from('prospect_connections').delete().eq('id', conn.id);
          orphanedCount++;
        }
      }

      // Update connection counts
      const { data: prospectsWithConns } = await supabase
        .from('prospects')
        .select(`id, connections_count, prospect_connections (id)`)
        .eq('team_id', teamId)
        .neq('status', 'not_a_fit');

      let updatedCounts = 0;
      for (const p of prospectsWithConns || []) {
        const actualCount = (p.prospect_connections || []).length;
        if (p.connections_count !== actualCount) {
          await supabase.from('prospects').update({
            connections_count: actualCount,
            has_warm_intro: actualCount > 0,
          }).eq('id', p.id);
          updatedCounts++;
        }
      }

      return { orphanedDeleted: orphanedCount, countsUpdated: updatedCounts };
    });

    // Final stats
    const finalStats = await step.run('final-stats', async () => {
      const { count: active } = await supabase
        .from('prospects')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .neq('status', 'not_a_fit');

      const { count: withReason } = await supabase
        .from('prospects')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .neq('status', 'not_a_fit')
        .not('helix_fit_reason', 'is', null);

      return { activeProspects: active, withFitReason: withReason };
    });

    return {
      status: 'success',
      deadCompaniesRemoved: deadCount,
      prospectsScored: scored,
      prospectsEliminated: eliminated,
      connections: connectionStats,
      final: finalStats,
    };
  }
);

// Export all functions
export const functions = [syncWarmIntros, scoreHelixFit, updatePriorityScores, learnFromFeedback, cleanupProspects, verifyProspectDomains];
