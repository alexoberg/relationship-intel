export type Category = 'vc' | 'angel' | 'sales_prospect' | 'irrelevant' | 'uncategorized';
export type CategorySource = 'rules' | 'ai' | 'manual' | 'helix';
export type HelixProduct = 'captcha_replacement' | 'voice_captcha' | 'age_verification';
export type ContactSource = 'linkedin_csv' | 'gmail' | 'gcal' | 'manual' | 'swarm';
export type EmailDirection = 'sent' | 'received';
export type FirmType = 'vc' | 'angel_network' | 'pe' | 'accelerator';

// Role and seniority normalization types
export type RoleCategory =
  | 'Engineering'
  | 'Product'
  | 'Design'
  | 'Sales'
  | 'Marketing'
  | 'Executive'
  | 'Operations'
  | 'Investing'
  | 'Customer Success';

export type SeniorityLevel =
  | 'C-Suite'
  | 'VP'
  | 'Director'
  | 'Manager'
  | 'Senior'
  | 'Mid'
  | 'Junior';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expiry: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  owner_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  email: string | null;
  linkedin_url: string | null;
  phone: string | null;
  current_title: string | null;
  current_company: string | null;
  current_company_industry: string | null;
  company_domain: string | null;
  category: Category;
  category_confidence: number;
  category_source: CategorySource;
  category_reason: string | null;
  helix_products: HelixProduct[] | null;
  proximity_score: number;
  last_interaction_at: string | null;
  interaction_count: number;
  enriched: boolean;
  enriched_at: string | null;
  pdl_id: string | null;
  source: ContactSource;
  created_at: string;
  updated_at: string;

  // Enrichment priority fields
  enrichment_priority: number;
  is_marketing_contact: boolean;
  has_two_way_communication: boolean;
  inbound_email_count: number;
  outbound_email_count: number;
  meeting_count: number;

  // Email filtering fields
  is_junk: boolean;               // Consolidated junk flag for UI filtering
  is_likely_marketing: boolean;
  is_generic_mailbox: boolean;
  filter_reason: string | null;
  email_domain: string | null;

  // Company history fields (NEW)
  company_history: string[];
  company_history_count: number;
  earliest_work_date: string | null;
  career_years: number | null;

  // Swarm integration fields
  swarm_profile_id: string | null;
  connection_strength: number; // 0-100, from Swarm's connection_strength
  swarm_synced_at: string | null;

  // Joined data
  work_history?: WorkHistory[];
}

export interface WorkHistory {
  id: string;
  contact_id: string;
  company_name: string;
  company_normalized: string | null;  // Normalized company name
  company_industry: string | null;
  company_size: string | null;
  company_linkedin_url: string | null;
  company_domain: string | null;
  title: string;
  title_normalized: string | null;    // Normalized title
  role_category: RoleCategory | null; // Engineering, Sales, etc.
  seniority_level: SeniorityLevel | null; // C-Suite, VP, Director, etc.
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  created_at: string;
}

export interface EmailInteraction {
  id: string;
  owner_id: string;
  contact_id: string | null;
  gmail_message_id: string;
  thread_id: string | null;
  subject: string | null;
  snippet: string | null;
  direction: EmailDirection;
  email_date: string;
  created_at: string;
}

export interface CalendarInteraction {
  id: string;
  owner_id: string;
  contact_id: string | null;
  gcal_event_id: string;
  summary: string | null;
  event_start: string;
  event_end: string | null;
  created_at: string;
}

export interface KnownFirm {
  id: string;
  name: string;
  type: FirmType;
  aliases: string[];
  domain: string | null;
  industry: string | null;
  company_size: string | null;
  linkedin_url: string | null;
  created_at: string;
}

// PDL API types
export interface PDLPersonResponse {
  status: number;
  data: PDLPerson;
}

export interface PDLPerson {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  linkedin_url: string;
  work_email: string;
  personal_emails: string[];
  phone_numbers: string[];
  job_title: string;
  job_company_name: string;
  job_company_industry: string;
  experience: PDLExperience[];
  education: PDLEducation[];
}

export interface PDLExperience {
  company: {
    name: string;
    size: string;
    industry: string;
    linkedin_url: string;
  };
  title: {
    name: string;
  };
  start_date: string;
  end_date: string | null;
  is_primary: boolean;
}

export interface PDLEducation {
  school: {
    name: string;
  };
  degrees: string[];
  end_date: string;
}

// LinkedIn CSV types - index signature allows for column name variations
export interface LinkedInConnection {
  'First Name'?: string;
  'Last Name'?: string;
  'Email Address'?: string;
  'Company'?: string;
  'Position'?: string;
  'Connected On'?: string;
  [key: string]: string | undefined;
}

// Dashboard filter types
export interface ContactFilters {
  category?: Category | 'all';
  minProximityScore?: number;
  enriched?: boolean;
  search?: string;
}

export interface ContactStats {
  total: number;
  byCategory: Record<Category, number>;
  enriched: number;
  avgProximityScore: number;
}

// Team types
export type TeamRole = 'admin' | 'member';

export interface Team {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
  joined_at: string;
  // Joined data
  profile?: Profile;
}

export interface Invite {
  id: string;
  team_id: string;
  code: string;
  created_by: string;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  is_active: boolean;
  created_at: string;
}

export interface GoogleAccount {
  id: string;
  user_id: string;
  email: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: string | null;
  is_primary: boolean;
  last_sync_at: string | null;
  created_at: string;
}

export interface TeamWithMembers extends Team {
  members: TeamMember[];
}

export interface JoinTeamResult {
  success: boolean;
  error?: string;
  team_id?: string;
  team_name?: string;
}

// Enrichment pipeline types
export interface EnrichmentBudget {
  id: string;
  user_id: string;
  authorized_amount: number;       // Pre-authorized spend ($500 default)
  increment_amount: number;        // Ask approval increment ($50 default)
  total_spent: number;
  enrichments_count: number;
  last_enrichment_at: string | null;
  pending_approval: boolean;
  pending_approval_amount: number | null;
  created_at: string;
  updated_at: string;
}

export interface EnrichmentLog {
  id: string;
  user_id: string;
  contact_id: string;
  pdl_id: string | null;
  pdl_status: number | null;
  pdl_likelihood: number | null;
  cost_usd: number;
  source: 'pdl' | 'clearbit' | 'manual';
  success: boolean;
  error_message: string | null;
  created_at: string;
}

export interface RoleCategoryLookup {
  id: string;
  name: RoleCategory;
  keywords: string[];
  created_at: string;
}

export interface SeniorityLevelLookup {
  id: string;
  name: SeniorityLevel;
  rank: number;
  keywords: string[];
  created_at: string;
}
