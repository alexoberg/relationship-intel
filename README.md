# Relationship Intel

A sales and fundraising relationship intelligence tool that helps you identify VCs, angels, and sales prospects in your network.

## Features

- **LinkedIn Import**: Upload your connections CSV to get started
- **Gmail/Calendar Sync**: Calculate proximity scores based on real interactions
- **PDL Enrichment**: Pull full work history from People Data Labs
- **Smart Categorization**: Auto-classify contacts as VC, Angel, Sales Prospect, or Irrelevant
- **Proximity Scoring**: Know who your closest relationships are
- **Multi-user**: Each team member connects their own accounts

## Tech Stack

- **Frontend**: Next.js 14, React, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth (Magic Link + Google OAuth)
- **Enrichment**: People Data Labs API
- **AI**: OpenAI GPT-4o-mini (for edge case categorization)
- **Deployment**: Vercel

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your keys

# Run the database schema
# (paste supabase/schema.sql into Supabase SQL editor)

# Start development server
npm run dev
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full deployment instructions.

## Project Structure

```
relationship-intel/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API routes
│   │   │   ├── auth/google/   # Google OAuth
│   │   │   ├── categorize/    # AI categorization
│   │   │   ├── enrich/        # PDL enrichment
│   │   │   └── sync/          # Gmail/GCal sync
│   │   ├── dashboard/         # Dashboard pages
│   │   │   ├── contacts/      # Contact list
│   │   │   ├── connect/       # Gmail/GCal connect
│   │   │   ├── enrich/        # Enrichment UI
│   │   │   ├── import/        # CSV import
│   │   │   └── settings/      # User settings
│   │   ├── auth/              # Auth callback
│   │   └── login/             # Login page
│   ├── components/            # React components
│   ├── lib/                   # Utilities
│   │   ├── categorization.ts  # Categorization rules
│   │   ├── google.ts          # Google API client
│   │   ├── linkedin-parser.ts # CSV parser
│   │   ├── pdl.ts             # PDL API client
│   │   └── supabase/          # Supabase clients
│   └── types/                 # TypeScript types
├── supabase/
│   └── schema.sql             # Database schema
├── .env.example               # Environment template
├── DEPLOYMENT.md              # Deployment guide
└── README.md                  # This file
```

## How It Works

### 1. Data Collection
- Users upload LinkedIn CSV exports
- Users connect Gmail/Calendar for interaction data

### 2. Enrichment (PDL)
- Look up contacts by email or LinkedIn URL
- Pull full work history (companies, titles, dates)
- Store enriched data in Supabase

### 3. Categorization
**Rules-based (instant):**
- Known VC/Angel firms database
- Title patterns (Partner, Investor, etc.)
- Industry matching

**AI-powered (for edge cases):**
- GPT-4o-mini analyzes work history
- Provides category + confidence score

### 4. Proximity Scoring
Based on interaction signals:
- Email exchanges (+5 per email, max 40)
- Calendar meetings (+10 per meeting, max 30)
- Recency of last interaction (+5 to +20)
- Base score for being a connection (+20)

## API Reference

### POST /api/enrich
Enrich contacts with PDL data.
```json
{
  "contactIds": ["uuid1", "uuid2"]
}
```

### POST /api/categorize
AI-categorize uncategorized contacts.
```json
{
  "contactIds": ["uuid1", "uuid2"]
}
```

### POST /api/sync
Sync Gmail and Calendar interactions.
```json
// No body required
```

## Database Schema

See `supabase/schema.sql` for the full schema. Key tables:

- `profiles` - User accounts
- `contacts` - Imported contacts
- `work_history` - Enriched job history
- `email_interactions` - Gmail sync data
- `calendar_interactions` - Calendar sync data
- `known_firms` - VC/Angel firm database

## License

MIT
