import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const resolveSessionStorage = (): Storage | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
};

const authStorage = resolveSessionStorage();

if (!supabaseUrl) {
  console.warn('VITE_SUPABASE_URL is not defini. Les fonctionnalites Supabase seront desactivees.');
}

if (!supabaseAnonKey) {
  console.warn('VITE_SUPABASE_ANON_KEY est manquant. Les fonctionnalites Supabase seront desactivees.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: Boolean(authStorage),
    storage: authStorage,
    storageKey: 'fiscalia.sb.auth',
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const getSupabaseEdgeUrl = () => {
  return import.meta.env.VITE_SUPABASE_EDGE_FUNCTION_URL || `${supabaseUrl}/functions/v1`;
};

