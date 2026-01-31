// Re-export client and all functions
export { inngest } from './client';
export { functions as enrichmentFunctions } from './functions/enrichment';

// Aggregate all functions for the serve handler
import { functions as enrichmentFunctions } from './functions/enrichment';

export const allFunctions = [
  ...enrichmentFunctions,
];
