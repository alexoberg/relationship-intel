import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// Load .env.local manually
const envContent = fs.readFileSync('.env.local', 'utf-8');
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    process.env[key.trim()] = valueParts.join('=').trim();
  }
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// PDL Company Enrichment
async function enrichCompanyByDomain(domain: string) {
  const apiKey = process.env.PDL_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'PDL API key not configured' };
  }

  const queryParams = new URLSearchParams({
    website: domain,
    api_key: apiKey,
  });

  const response = await fetch(`https://api.peopledatalabs.com/v5/company/enrich?${queryParams}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    return { success: false, error: `PDL error: ${response.status}` };
  }

  const data = await response.json();
  return { success: true, company: data };
}

// Helix product detection (simplified)
function detectHelixFit(industry: string | null, isTicketingPlatform: boolean) {
  const products: string[] = [];
  const reasons: string[] = [];
  let score = 50;

  const industryLower = (industry || '').toLowerCase();

  // Voice Captcha detection
  const voiceCaptchaIndustries = ['social media', 'ticketing', 'events', 'gaming', 'dating', 'marketplace', 'community'];
  if (voiceCaptchaIndustries.some(ind => industryLower.includes(ind)) || isTicketingPlatform) {
    products.push('voice_captcha');
    reasons.push(`voice_captcha: Industry (${industry}) needs unique human verification for events/ticketing`);
    score = 85;
  }

  // Age verification for certain industries
  const ageVerifyIndustries = ['alcohol', 'cannabis', 'gambling', 'gaming', 'tobacco'];
  if (ageVerifyIndustries.some(ind => industryLower.includes(ind))) {
    products.push('age_verification');
    reasons.push(`age_verification: Industry requires age verification`);
    score = Math.max(score, 80);
  }

  return { products, reasons: reasons.join('\n'), score };
}

async function enrich() {
  // Get Partiful
  const { data: prospect, error } = await supabase
    .from('prospects')
    .select('*')
    .eq('company_domain', 'partiful.com')
    .single();

  if (error || !prospect) {
    console.log('Error finding prospect:', error);
    return;
  }

  console.log('Current Partiful data:', {
    name: prospect.company_name,
    industry: prospect.company_industry,
    helix_score: prospect.helix_fit_score,
  });

  // Step 1: Enrich company from PDL
  console.log('\nEnriching from PDL...');
  const pdlResult = await enrichCompanyByDomain('partiful.com');

  if (pdlResult.success && pdlResult.company) {
    console.log('PDL data:', {
      name: pdlResult.company.display_name || pdlResult.company.name,
      industry: pdlResult.company.industry,
      size: pdlResult.company.size,
      summary: pdlResult.company.summary?.slice(0, 100),
    });

    // Update prospect with PDL data
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (pdlResult.company.display_name || pdlResult.company.name) {
      updates.company_name = pdlResult.company.display_name || pdlResult.company.name;
    }
    if (pdlResult.company.industry) {
      updates.company_industry = pdlResult.company.industry;
    }
    if (pdlResult.company.size) {
      updates.company_size = pdlResult.company.size;
    }
    if (pdlResult.company.linkedin_url) {
      updates.company_linkedin_url = pdlResult.company.linkedin_url;
    }
    if (pdlResult.company.summary) {
      updates.company_description = pdlResult.company.summary;
    }

    await supabase.from('prospects').update(updates).eq('id', prospect.id);
    console.log('Updated company data from PDL');

    // Step 2: Score Helix fit
    const industry = pdlResult.company.industry || prospect.company_industry;
    // Partiful is definitely a ticketing/events platform
    const isTicketing = true;

    const helixFit = detectHelixFit(industry, isTicketing);
    console.log('\nHelix fit analysis:', helixFit);

    await supabase.from('prospects').update({
      helix_products: helixFit.products,
      helix_fit_score: helixFit.score,
      helix_fit_reason: helixFit.reasons,
    }).eq('id', prospect.id);

    console.log('Updated Helix fit data');
  } else {
    console.log('PDL enrichment failed:', pdlResult.error);

    // Still score based on what we know - Partiful is an events platform
    const helixFit = detectHelixFit('events', true);
    console.log('\nHelix fit analysis (without PDL):', helixFit);

    await supabase.from('prospects').update({
      helix_products: helixFit.products,
      helix_fit_score: helixFit.score,
      helix_fit_reason: helixFit.reasons,
    }).eq('id', prospect.id);

    console.log('Updated Helix fit data');
  }

  // Verify
  const { data: updated } = await supabase
    .from('prospects')
    .select('company_name, company_industry, helix_fit_score, helix_fit_reason, helix_products')
    .eq('company_domain', 'partiful.com')
    .single();

  console.log('\nFinal Partiful data:', JSON.stringify(updated, null, 2));
}

enrich();
