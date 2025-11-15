import { supabase } from './supabaseClient';
import type { Session, User } from '@supabase/supabase-js';

export interface Credentials {
  email: string;
  password: string;
}

export interface SignUpPayload extends Credentials {
  name?: string;
}

export const authService = {
  async getSession(): Promise<Session | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Failed to get session', error);
      return null;
    }
    return data.session ?? null;
  },

  onAuthStateChange(callback: (session: Session | null) => void) {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session);
    });
    return () => subscription.unsubscribe();
  },

  async signIn({ email, password }: Credentials) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      throw error;
    }
    return data.session;
  },

  async signUp({ email, password, name }: SignUpPayload) {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          name,
        },
      },
    });
    if (error) {
      throw error;
    }
    return data.session;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
  },

  async getUser(): Promise<User | null> {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.error('Failed to get user', error);
      return null;
    }
    return data.user ?? null;
  },
};

