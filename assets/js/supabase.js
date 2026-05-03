export const SUPABASE_URL = 'https://hnrzfofzzbavhvttiszp.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_KFJu8c17nRCkBN1YwhWaGQ_so7MYTmi';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhucnpmb2Z6emJhdmh2dHRpc3pwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzU0MjIyOCwiZXhwIjoyMDkzMTE4MjI4fQ.UTYoHB0jDvqSpYWOreJ2agYg3ptvOnTJSScQ6bzBOV8';

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

export const sbAdmin = SUPABASE_SERVICE_KEY
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;
