/**
 * Unified Contact Ingestion Types
 *
 * Supports three ingestion sources:
 * 1. Swarm (preferred) - 580M profile database with connection strength
 * 2. LinkedIn CSV - exported connections
 * 3. Google OAuth - Gmail/Calendar contacts
 */

export type IngestionSource = 'swarm' | 'linkedin_csv' | 'google';

export interface RawContact {
  // Identity (at least one required for matching)
  email?: string;
  linkedin_url?: string;

  // Profile data
  full_name: string;
  first_name?: string;
  last_name?: string;
  current_title?: string;
  current_company?: string;
  company_domain?: string;
  phone?: string;

  // Source-specific data
  source: IngestionSource;
  source_id?: string; // e.g., swarm_profile_id, gmail_message_id

  // Swarm-specific
  connection_strength?: number; // 0-100

  // Google-specific
  interaction_count?: number;
  last_interaction_at?: string;
}

export interface IngestionResult {
  success: boolean;
  inserted: number;
  updated: number;
  merged: number;
  errors: number;
  error_details?: string[];
}

export interface MergeCandidate {
  existing_id: string;
  match_type: 'email' | 'linkedin' | 'name_company';
  match_confidence: number; // 0-1
}

export interface ContactUpsertData {
  // Required
  owner_id: string;
  team_id: string;
  full_name: string;
  source: IngestionSource;

  // Optional identity
  email?: string | null;
  linkedin_url?: string | null;

  // Optional profile
  first_name?: string | null;
  last_name?: string | null;
  current_title?: string | null;
  current_company?: string | null;
  company_domain?: string | null;
  phone?: string | null;

  // Swarm fields
  swarm_profile_id?: string | null;
  connection_strength?: number;
  swarm_synced_at?: string | null;

  // Interaction fields
  interaction_count?: number;
  last_interaction_at?: string | null;
}
