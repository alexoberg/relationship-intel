// Re-export client and all functions
export { inngest } from './client';
export { functions as enrichmentFunctions } from './functions/enrichment';
export { functions as syncFunctions } from './functions/sync';

// Aggregate all functions for the serve handler
import { functions as enrichmentFunctions } from './functions/enrichment';
import { functions as syncFunctions } from './functions/sync';

export const allFunctions = [
  ...enrichmentFunctions,
  ...syncFunctions,
];
