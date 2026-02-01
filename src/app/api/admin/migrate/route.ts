import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import postgres from 'postgres';

// Admin-only migration endpoint
// Run via: POST /api/admin/migrate with header X-Admin-Key

const MIGRATIONS: Record<string, string> = {
  'job-history': `
    ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS job_history jsonb DEFAULT '[]'::jsonb;
    ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS enrichment_status text DEFAULT 'pending';
    ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS enrichment_error text;
    ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_enrichment_attempt timestamp with time zone;
    ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS current_company_normalized text;
    ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS current_title_normalized text;
  `,
  'job-history-indexes': `
    CREATE INDEX IF NOT EXISTS contacts_job_history_idx ON public.contacts USING GIN (job_history);
    CREATE INDEX IF NOT EXISTS contacts_enrichment_status_idx ON public.contacts (enrichment_status) WHERE enrichment_status != 'enriched';
  `,
  'enrichment-constraint': `
    DO $$ BEGIN
      ALTER TABLE public.contacts ADD CONSTRAINT contacts_enrichment_status_check
        CHECK (enrichment_status IN ('pending', 'enriching', 'enriched', 'failed', 'skipped'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `,
};

export async function POST(request: NextRequest) {
  const adminKey = request.headers.get('x-admin-key');
  if (adminKey !== process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { migration, databaseUrl } = await request.json();
  
  if (!migration || !MIGRATIONS[migration]) {
    return NextResponse.json({ 
      error: 'Invalid migration',
      available: Object.keys(MIGRATIONS)
    }, { status: 400 });
  }

  // If DATABASE_URL provided, try to run migration directly
  if (databaseUrl) {
    try {
      const sql = postgres(databaseUrl);
      await sql.unsafe(MIGRATIONS[migration]);
      await sql.end();
      return NextResponse.json({
        success: true,
        migration,
        message: 'Migration executed successfully'
      });
    } catch (err) {
      return NextResponse.json({ 
        error: err instanceof Error ? err.message : 'Database error',
        sql: MIGRATIONS[migration]
      }, { status: 500 });
    }
  }

  // Otherwise return SQL for manual execution
  return NextResponse.json({
    message: 'No DATABASE_URL - run this SQL in Supabase SQL Editor',
    migration,
    sql: MIGRATIONS[migration]
  });
}

export async function GET() {
  return NextResponse.json({
    available_migrations: Object.keys(MIGRATIONS),
    usage: 'POST { "migration": "name" } with X-Admin-Key header'
  });
}
