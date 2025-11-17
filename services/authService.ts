import { supabase } from './supabaseClient';
import type { Session, User, AuthChangeEvent } from '@supabase/supabase-js';

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

  onAuthStateChange(callback: (session: Session | null, event?: AuthChangeEvent) => void) {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      callback(session, event);
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

  async requestPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}`,
    });
    if (error) {
      throw error;
    }
  },

  async updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) {
      throw error;
    }
  },

  async changePassword(currentPassword: string, newPassword: string) {
    // First verify current password by attempting to sign in
    const user = await this.getUser();
    if (!user?.email) {
      throw new Error('Utilisateur non trouvé');
    }

    // Verify current password
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      throw new Error('Mot de passe actuel incorrect');
    }

    // Update to new password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      throw updateError;
    }
  },
};

