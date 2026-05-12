export const SUPABASE_URL = 'https://hnrzfofzzbavhvttiszp.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_KFJu8c17nRCkBN1YwhWaGQ_so7MYTmi';

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});
