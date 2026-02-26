import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://ijpuizwmcxkictqyjcfr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqcHVpendtY3hraWN0cXlqY2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMDk1MjksImV4cCI6MjA4NzY4NTUyOX0.O1j-Ky_rlbzxmmsGsJFluPwEAmcPquN68x3wTU1Kqiw";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
