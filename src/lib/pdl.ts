import { PDLPerson, PDLPersonResponse, PDLExperience } from '@/types/database';

const PDL_API_URL = 'https://api.peopledatalabs.com/v5/person/enrich';

export interface EnrichmentResult {
  success: boolean;
  person?: PDLPerson;
  error?: string;
}

export async function enrichByEmail(email: string): Promise<EnrichmentResult> {
  return enrichPerson({ email });
}

export async function enrichByLinkedIn(linkedinUrl: string): Promise<EnrichmentResult> {
  // Clean up LinkedIn URL
  const cleanUrl = normalizeLinkedInUrl(linkedinUrl);
  return enrichPerson({ profile: cleanUrl });
}

export async function enrichByNameAndCompany(
  name: string,
  company: string
): Promise<EnrichmentResult> {
  return enrichPerson({ name, company });
}

async function enrichPerson(params: Record<string, string>): Promise<EnrichmentResult> {
  const apiKey = process.env.PDL_API_KEY;

  if (!apiKey) {
    return { success: false, error: 'PDL API key not configured' };
  }

  try {
    const queryParams = new URLSearchParams({
      ...params,
      api_key: apiKey,
    });

    const response = await fetch(`${PDL_API_URL}?${queryParams}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.status === 404) {
      return { success: false, error: 'Person not found in PDL database' };
    }

    if (response.status === 402) {
      return { success: false, error: 'PDL credits exhausted' };
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: `PDL API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`
      };
    }

    const data: PDLPersonResponse = await response.json();
    return { success: true, person: data.data };
  } catch (error) {
    return {
      success: false,
      error: `Failed to enrich: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

export function normalizeLinkedInUrl(url: string): string {
  if (!url) return url;

  // Remove protocol and www
  let clean = url.replace(/^https?:\/\//, '').replace(/^www\./, '');

  // Ensure it starts with linkedin.com
  if (!clean.startsWith('linkedin.com')) {
    clean = `linkedin.com/in/${clean}`;
  }

  // Remove trailing slash
  clean = clean.replace(/\/$/, '');

  return `https://${clean}`;
}

export function extractWorkHistory(person: PDLPerson): Array<{
  company_name: string;
  company_industry: string | null;
  company_size: string | null;
  company_linkedin_url: string | null;
  title: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
}> {
  if (!person.experience || !Array.isArray(person.experience)) {
    return [];
  }

  return person.experience.map((exp: PDLExperience) => ({
    company_name: exp.company?.name || 'Unknown',
    company_industry: exp.company?.industry || null,
    company_size: exp.company?.size || null,
    company_linkedin_url: exp.company?.linkedin_url || null,
    title: exp.title?.name || 'Unknown',
    start_date: exp.start_date || null,
    end_date: exp.end_date || null,
    is_current: exp.is_primary || !exp.end_date,
  }));
}

// Batch enrichment with rate limiting
export async function batchEnrich(
  contacts: Array<{ id: string; email?: string; linkedin_url?: string }>,
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, EnrichmentResult>> {
  const results = new Map<string, EnrichmentResult>();
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];

    let result: EnrichmentResult;

    if (contact.linkedin_url) {
      result = await enrichByLinkedIn(contact.linkedin_url);
    } else if (contact.email) {
      result = await enrichByEmail(contact.email);
    } else {
      result = { success: false, error: 'No email or LinkedIn URL provided' };
    }

    results.set(contact.id, result);

    if (onProgress) {
      onProgress(i + 1, contacts.length);
    }

    // Rate limit: 10 requests per second for PDL free tier
    if (i < contacts.length - 1) {
      await delay(150);
    }
  }

  return results;
}
