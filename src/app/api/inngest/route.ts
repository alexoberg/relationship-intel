import { serve } from 'inngest/next';
import { inngest, allFunctions } from '@/lib/inngest';

// Create the Inngest serve handler for Next.js
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: allFunctions,
});
