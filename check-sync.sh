#!/bin/bash
# Quick sync progress checker

SUPABASE_URL="https://qqfqpjjquiktljofctby.supabase.co"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxZnFwampxdWlrdGxqb2ZjdGJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTcxODIzNCwiZXhwIjoyMDg1Mjk0MjM0fQ.SMjpxJ1heQlfjnw7QEQkMtrhz60lqE-KpglZmcV7nKA"
USER_ID="4cdff414-4475-49cf-a5ed-033f4efabde8"

echo "=== Sync Progress at $(date +%H:%M:%S) ==="

echo -n "Contacts: "
curl -s "$SUPABASE_URL/rest/v1/contacts?owner_id=eq.$USER_ID&select=id" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Prefer: count=exact" -I 2>/dev/null | grep -i content-range | awk -F'/' '{print $2}'

echo -n "Emails: "
curl -s "$SUPABASE_URL/rest/v1/email_interactions?owner_id=eq.$USER_ID&select=id" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Prefer: count=exact" -I 2>/dev/null | grep -i content-range | awk -F'/' '{print $2}'

echo -n "Meetings: "
curl -s "$SUPABASE_URL/rest/v1/calendar_interactions?owner_id=eq.$USER_ID&select=id" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Prefer: count=exact" -I 2>/dev/null | grep -i content-range | awk -F'/' '{print $2}'

SYNC_TS=$(curl -s "$SUPABASE_URL/rest/v1/profiles?id=eq.$USER_ID&select=last_gmail_sync_at" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" | jq -r '.[0].last_gmail_sync_at // "null"')

if [ "$SYNC_TS" = "null" ]; then
  echo "Status: Sync in progress..."
else
  echo "Status: Completed at $SYNC_TS"
fi
