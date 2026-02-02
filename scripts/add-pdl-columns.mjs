// Add PDL columns via Supabase Management API
const PROJECT_REF = 'qqfqpjjquiktljofctby';
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || 'sbp_e9e3a9a7cd93e915ca876a210e5abde72f92f4f0';

async function runSQL(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error: ${response.status} - ${text}`);
  }
  
  return response.json();
}

async function main() {
  console.log('Adding PDL columns to contacts table...');
  
  try {
    // Add pdl_data JSONB column
    await runSQL(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pdl_data JSONB`);
    console.log('✅ Added pdl_data column');
    
    // Add location column
    await runSQL(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS location TEXT`);
    console.log('✅ Added location column');
    
    console.log('\n✅ Columns added successfully!');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
