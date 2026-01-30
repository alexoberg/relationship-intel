# Relationship Intel - Deployment Guide

## Quick Start (24-Hour Build)

This guide will get you from zero to deployed in under an hour.

---

## Prerequisites

You'll need accounts for:
- **Supabase** (free): https://supabase.com
- **Vercel** (free): https://vercel.com
- **People Data Labs** (free tier): https://peopledatalabs.com
- **Google Cloud Console** (free): https://console.cloud.google.com
- **OpenAI** (optional, for AI categorization): https://platform.openai.com

---

## Step 1: Set Up Supabase (10 minutes)

### Create Project
1. Go to https://supabase.com and sign in
2. Click "New Project"
3. Name it `relationship-intel`
4. Set a strong database password (save this!)
5. Choose a region close to your users
6. Click "Create new project"

### Run Database Schema
1. In your Supabase dashboard, go to **SQL Editor**
2. Copy the entire contents of `supabase/schema.sql`
3. Paste into the SQL editor and click **Run**
4. You should see "Success. No rows returned" for each statement

### Enable Auth Providers
1. Go to **Authentication** → **Providers**
2. Enable **Email** (Magic Link)
3. Enable **Google**:
   - You'll configure the Google credentials in Step 3

### Get Your Keys
1. Go to **Settings** → **API**
2. Copy these values (you'll need them for Vercel):
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 2: Set Up People Data Labs (5 minutes)

1. Go to https://peopledatalabs.com
2. Sign up for a free account
3. Go to **Dashboard** → **API Keys**
4. Copy your API key → `PDL_API_KEY`

**Free Tier Limits:**
- 100 person enrichments/month
- 100 company enrichments/month

---

## Step 3: Set Up Google OAuth (15 minutes)

This enables Gmail and Calendar sync for proximity scoring.

### Create Project
1. Go to https://console.cloud.google.com
2. Create a new project called `relationship-intel`
3. Select the project

### Enable APIs
1. Go to **APIs & Services** → **Library**
2. Search and enable:
   - Gmail API
   - Google Calendar API
   - Google+ API (for profile info)

### Configure OAuth Consent Screen
1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** user type
3. Fill in:
   - App name: `Relationship Intel`
   - User support email: your email
   - Developer contact: your email
4. Add scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
5. Add your email as a test user (required while in testing mode)

### Create OAuth Credentials
1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `Relationship Intel Web`
5. Add Authorized redirect URIs:
   - `http://localhost:3000/api/auth/google/callback` (for local dev)
   - `https://YOUR-DOMAIN.vercel.app/api/auth/google/callback` (for production)
6. Click **Create**
7. Copy:
   - Client ID → `GOOGLE_CLIENT_ID`
   - Client Secret → `GOOGLE_CLIENT_SECRET`

### Add Google OAuth to Supabase
1. Back in Supabase, go to **Authentication** → **Providers** → **Google**
2. Paste your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
3. Save

---

## Step 4: OpenAI Setup (Optional, 5 minutes)

For AI-powered contact categorization:

1. Go to https://platform.openai.com
2. Create an API key
3. Copy it → `OPENAI_API_KEY`

If you skip this, the app will still work with rule-based categorization only.

---

## Step 5: Deploy to Vercel (10 minutes)

### Option A: Deploy from GitHub (Recommended)

1. Push this code to a GitHub repository
2. Go to https://vercel.com
3. Click **Add New** → **Project**
4. Import your GitHub repository
5. Vercel will auto-detect Next.js
6. Add Environment Variables (click **Environment Variables**):

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
PDL_API_KEY=your_pdl_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
OPENAI_API_KEY=your_openai_key (optional)
NEXT_PUBLIC_APP_URL=https://your-project.vercel.app
```

7. Click **Deploy**

### Option B: Deploy via CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
cd relationship-intel
vercel

# Set environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL
# ... add all other env vars
```

---

## Step 6: Update Redirect URIs

After deployment, update your Google OAuth redirect URI:

1. Go to Google Cloud Console → Credentials
2. Edit your OAuth client
3. Add: `https://YOUR-DOMAIN.vercel.app/api/auth/google/callback`
4. Save

---

## Local Development

```bash
# Clone and install
git clone <your-repo>
cd relationship-intel
npm install

# Copy env file
cp .env.example .env.local

# Fill in your env vars in .env.local

# Run development server
npm run dev
```

Visit http://localhost:3000

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `PDL_API_KEY` | Yes | People Data Labs API key |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `OPENAI_API_KEY` | No | OpenAI API key for AI categorization |
| `NEXT_PUBLIC_APP_URL` | Yes | Your app's URL |

---

## Testing Checklist

After deployment, verify:

- [ ] Can sign up with email (magic link)
- [ ] Can sign in with Google
- [ ] Can upload LinkedIn CSV
- [ ] Contacts appear in dashboard
- [ ] Can connect Gmail/Calendar
- [ ] Enrichment pulls work history
- [ ] Categorization rules work
- [ ] Proximity scores update after sync

---

## Troubleshooting

### "Invalid redirect_uri" from Google
- Make sure your Vercel URL is added to Google OAuth authorized redirect URIs
- Check that `NEXT_PUBLIC_APP_URL` matches your actual deployment URL

### "PDL API error: 402"
- You've run out of PDL credits
- Wait until next month or upgrade your PDL plan

### Contacts not syncing from Gmail
- Make sure you've granted Gmail read permissions
- Check that the contact's email exists in your imported contacts

### Supabase RLS errors
- Run the schema.sql again to ensure all policies are created
- Check that you're logged in (the policies use `auth.uid()`)

---

## Costs

**Monthly costs at scale:**

| Service | Free Tier | Paid |
|---------|-----------|------|
| Supabase | 500MB DB, 2GB bandwidth | $25/mo |
| Vercel | 100GB bandwidth | $20/mo |
| PDL | 100 enrichments | $0.20-0.28 each |
| OpenAI | Pay per use | ~$0.01 per categorization |

For a team of 5 with 500 contacts each, expect ~$50-100/month.

---

## Next Steps

Once deployed:

1. **Import your LinkedIn connections** - Export from LinkedIn settings
2. **Enrich top contacts** - Start with your most valuable connections
3. **Connect Gmail** - This enables proximity scoring
4. **Review uncategorized** - Manually categorize edge cases
5. **Invite your team** - They can connect their own accounts

---

## Support

Built by your friendly AI assistant. For issues:
- Check this README
- Review the code comments
- The architecture is straightforward - most issues are env var related
