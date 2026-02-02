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

For each company, determine:
- Which specific Helix product(s) fit and WHY (be specific about the use case)
- If NO clear fit exists, set is_fit to false

Companies: ${JSON.stringify(prospectInfo, null, 2)}

Return JSON:
{
  "results": [
    {
      "id": "uuid",
      "is_fit": true,
      "products": ["bot_sorter"],
      "reason": "Specific explanation of why this product fits their business"
    }
  ]
}

Be honest - if you can't articulate a specific use case, set is_fit to false.`;

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

// Export all functions
export const functions = [syncWarmIntros, scoreHelixFit, updatePriorityScores, learnFromFeedback];
