import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';
import { HttpError } from './errors.ts';
import { normalizeNullableString } from './normalise.ts';
import { generateId } from './ids.ts';

export const upsertCategory = async (supabase: SupabaseClient, userId: string, name: string): Promise<void> => {
  const normalized = normalizeNullableString(name);
  if (!normalized) {
    throw new HttpError('Le nom de la catégorie est requis.', 400);
  }

  const { error } = await supabase
    .from('categories')
    .upsert({ id: generateId('cat'), user_id: userId, name: normalized }, { onConflict: 'user_id,name', ignoreDuplicates: true });

  if (error && error.code !== '23505') throw new HttpError(`Database error: ${error.message}`, 500);
};

export const renameCategory = async (
  supabase: SupabaseClient,
  userId: string,
  currentName: string,
  nextName: string,
): Promise<void> => {
  const current = normalizeNullableString(currentName);
  const next = normalizeNullableString(nextName);
  if (!current || !next) {
    throw new HttpError('Le nom de catégorie est requis.', 400);
  }
  if (current.toLowerCase() === next.toLowerCase()) {
    return;
  }

  const { data: conflict } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', next)
    .maybeSingle();

  if (conflict) {
    throw new HttpError('La catégorie existe déjà.', 400);
  }

  const { data: renameResult, error: renameError } = await supabase
    .from('categories')
    .update({ name: next })
    .eq('user_id', userId)
    .ilike('name', current)
    .select('id')
    .maybeSingle();

  if (renameError) throw new HttpError(`Database error: ${renameError.message}`, 500);
  if (!renameResult) {
    throw new HttpError('Catégorie introuvable.', 404);
  }

  const { error: updateError } = await supabase
    .from('expenses')
    .update({ category: next })
    .eq('user_id', userId)
    .ilike('category', current);

  if (updateError) throw new HttpError(`Database error: ${updateError.message}`, 500);
};

export const deleteCategory = async (supabase: SupabaseClient, userId: string, name: string): Promise<void> => {
  const normalized = normalizeNullableString(name);
  if (!normalized) {
    throw new HttpError('Le nom de la catégorie est requis.', 400);
  }
  if (normalized === 'Autre') {
    throw new HttpError('La catégorie "Autre" ne peut pas être supprimée.', 400);
  }

  const { error: deleteError } = await supabase
    .from('categories')
    .delete()
    .eq('user_id', userId)
    .eq('name', normalized);

  if (deleteError) throw new HttpError(`Database error: ${deleteError.message}`, 500);

  const { error: updateError } = await supabase
    .from('expenses')
    .update({ category: 'Autre' })
    .eq('user_id', userId)
    .eq('category', normalized);

  if (updateError) throw new HttpError(`Database error: ${updateError.message}`, 500);
};

export interface NotificationRecord {
  id: string;
  user_id: string;
  message: string;
  type: string;
  timestamp: string;
  read: boolean;
  job_id: string | null;
}

export const createNotification = async (
  supabase: SupabaseClient,
  userId: string,
  payload: { message: string; type?: string | null; jobId?: string | null },
): Promise<NotificationRecord> => {
  const message = normalizeNullableString(payload.message);
  if (!message) {
    throw new HttpError('Le message de notification est requis.', 400);
  }
  const type = normalizeNullableString(payload.type) ?? 'info';
  const jobId = normalizeNullableString(payload.jobId);

  const notificationData = {
    id: generateId('notif'),
    user_id: userId,
    message,
    type,
    timestamp: new Date().toISOString(),
    read: false,
    job_id: jobId,
  };

  const { data: result, error } = await supabase
    .from('notifications')
    .insert(notificationData)
    .select()
    .single();

  if (error) throw new HttpError(`Database error: ${error.message}`, 500);
  if (!result) throw new HttpError('Failed to create notification', 500);

  return result as NotificationRecord;
};

const findNotificationByMessage = async (
  supabase: SupabaseClient,
  userId: string,
  message: string,
): Promise<NotificationRecord | null> => {
  const { data: notifications, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(20);

  if (error) throw new HttpError(`Database error: ${error.message}`, 500);

  const lowered = message.toLowerCase();
  return notifications?.find((notification) => notification.message.toLowerCase().includes(lowered)) ?? null;
};

const resolveNotificationTarget = async (
  supabase: SupabaseClient,
  userId: string,
  options: { notificationId?: string | null; notificationMessage?: string | null },
): Promise<NotificationRecord> => {
  const idCandidate = normalizeNullableString(options.notificationId);
  if (idCandidate) {
    const { data: result, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('id', idCandidate)
      .maybeSingle();
    
    if (error && error.code !== 'PGRST116') throw new HttpError(`Database error: ${error.message}`, 500);
    if (result) {
      return result as NotificationRecord;
    }
  }

  const messageCandidate = normalizeNullableString(options.notificationMessage);
  if (messageCandidate) {
    const notification = await findNotificationByMessage(supabase, userId, messageCandidate);
    if (notification) {
      return notification;
    }
  }

  throw new HttpError('Notification introuvable.', 404);
};

export const markNotificationRead = async (
  supabase: SupabaseClient,
  userId: string,
  options: { notificationId?: string | null; notificationMessage?: string | null },
): Promise<void> => {
  const notification = await resolveNotificationTarget(supabase, userId, options);
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('id', notification.id);

  if (error) throw new HttpError(`Database error: ${error.message}`, 500);
};

export const deleteNotification = async (
  supabase: SupabaseClient,
  userId: string,
  options: { notificationId?: string | null; notificationMessage?: string | null },
): Promise<void> => {
  const notification = await resolveNotificationTarget(supabase, userId, options);
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', userId)
    .eq('id', notification.id);

  if (error) throw new HttpError(`Database error: ${error.message}`, 500);
};

export const catalogRepository = {
  upsertCategory,
  renameCategory,
  deleteCategory,
  createNotification,
  markNotificationRead,
  deleteNotification,
};

