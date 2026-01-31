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

export type InngestEvents =
  | EnrichmentStartedEvent
  | EnrichmentCompletedEvent
  | SyncCompletedEvent;
