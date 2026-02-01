// Re-export client and all functions
export { inngest } from './client';
export { functions as enrichmentFunctions } from './functions/enrichment';
export { functions as syncFunctions } from './functions/sync';
export { functions as prospectFunctions } from './functions/prospect-sync';
export { functions as contactIngestionFunctions } from './functions/contact-ingestion';
export { 
  syncContacts, 
  cleanupContacts, 
  enrichContacts, 
  scheduledSync,
  onLoginSync 
} from './functions/contact-pipeline';

// Aggregate all functions for the serve handler
import { functions as enrichmentFunctions } from './functions/enrichment';
import { functions as syncFunctions } from './functions/sync';
import { functions as prospectFunctions } from './functions/prospect-sync';
import { functions as contactIngestionFunctions } from './functions/contact-ingestion';
import { 
  syncContacts, 
  cleanupContacts, 
  enrichContacts, 
  scheduledSync,
  onLoginSync 
} from './functions/contact-pipeline';

export const allFunctions = [
  ...enrichmentFunctions,
  ...syncFunctions,
  ...prospectFunctions,
  ...contactIngestionFunctions,
  syncContacts,
  cleanupContacts,
  enrichContacts,
  scheduledSync,
  onLoginSync,
];
