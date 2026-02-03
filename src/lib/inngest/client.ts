import { Inngest } from 'inngest';

// Create Inngest client
export const inngest = new Inngest({
  id: 'relationship-intel',
  name: 'Relationship Intelligence',
});

// Event types
export interface EnrichmentStartedEvent {
  name: 'enrichment/started';
  data: {
    userId: string;
    batchSize?: number;
    priorityThreshold?: number;
  };
}

export interface EnrichmentCompletedEvent {
  name: 'enrichment/completed';
  data: {
    userId: string;
    enrichedCount: number;
    totalCost: number;
    errors: string[];
  };
}

export interface SyncCompletedEvent {
  name: 'sync/completed';
  data: {
    userId: string;
    contactsCreated: number;
    emailsSynced: number;
    meetingsSynced: number;
  };
}

export interface BackgroundSyncStartedEvent {
  name: 'sync/background-started';
  data: {
    userId: string;
    accessToken: string;
    refreshToken?: string;
    maxMessages?: number;
    sinceDate?: string;
    triggerEnrichment?: boolean;
  };
}

// Listener events
export interface ListenerScanHNEvent {
  name: 'listener/scan-hn';
  data: {
    teamId: string;
    scanType?: 'front_page' | 'ask_hn' | 'show_hn' | 'all';
    maxItems?: number;
    includeComments?: boolean;
  };
}

export interface ListenerScanRSSEvent {
  name: 'listener/scan-rss';
  data: {
    teamId: string;
    feedUrls?: string[];
    maxArticles?: number;
    maxAgeHours?: number;
  };
}

export interface ListenerPromoteEvent {
  name: 'listener/promote';
  data: {
    discoveryId: string;
    teamId: string;
    userId?: string;
  };
}

export interface ListenerScanHNProfilesEvent {
  name: 'listener/scan-hn-profiles';
  data: {
    teamId: string;
    maxStoriesPerScan?: number;
    maxUsersPerStory?: number;
    minKeywordScore?: number;
    minKarma?: number;
    minConfidence?: number;
    autoPromoteThreshold?: number;
    rescanAfterHours?: number;
    enrichWithGitHub?: boolean;
  };
}

export interface GenerateLookalikesEvent {
  name: 'prospects/generate-lookalikes';
  data: {
    teamId: string;
    minScore?: number;
    count?: number;
    save?: boolean;
  };
}

export type InngestEvents =
  | EnrichmentStartedEvent
  | EnrichmentCompletedEvent
  | SyncCompletedEvent
  | BackgroundSyncStartedEvent
  | ListenerScanHNEvent
  | ListenerScanRSSEvent
  | ListenerPromoteEvent
  | ListenerScanHNProfilesEvent
  | GenerateLookalikesEvent;
