import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';
import { resolveAllowedOrigin } from '../_shared/cors.ts';
import { handleOptions, jsonResponse } from '../_shared/http.ts';
import { getEnvVar } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import { sanitizeActions, type SanitizedAction } from '../_shared/actions.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';
import { financialRepository } from '../_shared/financial.ts';
import { catalogRepository } from '../_shared/catalog.ts';
import { HttpError, normaliseError } from '../_shared/errors.ts';
import { recordMetric } from '../_shared/metrics.ts';
import { checkRateLimit, RATE_LIMITS } from '../_shared/rateLimit.ts';
import { normalizeNullableString } from '../_shared/normalise.ts';

type ActionExecutionStatus = 'success' | 'failed';

interface ActionExecutionLogEntry {
  action: string;
  status: ActionExecutionStatus;
  detail?: string;
  payload?: unknown;
  elapsedMs: number;
}

interface ExecuteResponseBody {
  success: boolean;
  mutated: boolean;
  log: ActionExecutionLogEntry[];
  error?: string;
}

const fetchJobIdByName = async (supabase: SupabaseClient, userId: string, name: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from('jobs')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', `%${name}%`)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data?.id ?? null;
};

const fetchExpenseIdByName = async (
  supabase: SupabaseClient,
  userId: string,
  name: string,
): Promise<string | null> => {
  const { data, error } = await supabase
    .from('expenses')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', `%${name}%`)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data?.id ?? null;
};

const resolveJobId = async (
  supabase: SupabaseClient,
  userId: string,
  payload: { jobId?: unknown; jobName?: unknown },
): Promise<string> => {
  const idCandidate = normalizeNullableString(payload.jobId);
  if (idCandidate) {
    const { data, error } = await supabase
      .from('jobs')
      .select('id')
      .eq('user_id', userId)
      .eq('id', idCandidate)
      .maybeSingle();
    
    if (error && error.code !== 'PGRST116') throw new HttpError(`Database error: ${error.message}`, 500);
    if (data?.id) return idCandidate;
  }

  const nameCandidate = normalizeNullableString(payload.jobName);
  if (nameCandidate) {
    const matchedId = await fetchJobIdByName(supabase, userId, nameCandidate);
    if (matchedId) {
      return matchedId;
    }
  }

  throw new HttpError('Contrat introuvable.', 404);
};

const resolveExpenseId = async (
  supabase: SupabaseClient,
  userId: string,
  payload: { expenseId?: unknown; expenseName?: unknown },
): Promise<string> => {
  const idCandidate = normalizeNullableString(payload.expenseId);
  if (idCandidate) {
    const { data, error } = await supabase
      .from('expenses')
      .select('id')
      .eq('user_id', userId)
      .eq('id', idCandidate)
      .maybeSingle();
    
    if (error && error.code !== 'PGRST116') throw new HttpError(`Database error: ${error.message}`, 500);
    if (data?.id) return idCandidate;
  }

  const nameCandidate = normalizeNullableString(payload.expenseName);
  if (nameCandidate) {
    const matchedId = await fetchExpenseIdByName(supabase, userId, nameCandidate);
    if (matchedId) {
      return matchedId;
    }
  }

  throw new HttpError('Dépense introuvable.', 404);
};

const executeAction = async (
  supabase: SupabaseClient,
  userId: string,
  action: SanitizedAction,
): Promise<{ mutated: boolean; detail?: string; payload?: unknown }> => {
  const detailFallback =
    action.confirmationMessage && action.confirmationMessage.length > 0 ? action.confirmationMessage : undefined;

  switch (action.action) {
    case 'create_job': {
      const data = action.data ?? {};
      const name = normalizeNullableString(data.name) ?? normalizeNullableString(data.jobName);
      if (!name) {
        throw new HttpError('Le nom du contrat est requis.', 400);
      }
      const job = await financialRepository.createJob(supabase, userId, {
        id: normalizeNullableString(data.jobId),
        name,
        clientName: normalizeNullableString(data.clientName),
        address: normalizeNullableString(data.address),
        description: normalizeNullableString(data.description),
        status: normalizeNullableString(data.status),
        revenue: data.revenue ?? data.amount ?? null,
        expenses: data.expenses ?? null,
        profit: data.profit ?? null,
        startDate: normalizeNullableString(data.startDate),
        endDate: normalizeNullableString(data.endDate),
      });
      return {
        mutated: true,
        detail: detailFallback ?? `Contrat « ${job.name} » enregistré.`,
        payload: { jobId: job.id },
      };
    }
    case 'update_job': {
      const data = action.data ?? {};
      const jobId = await resolveJobId(supabase, userId, {
        jobId: data.jobId,
        jobName: data.jobName,
      });
      const updatesSource =
        data.updates && typeof data.updates === 'object' ? (data.updates as Record<string, unknown>) : data;

      // Only include fields that are actually present in the updates
      const updatePayload: Record<string, unknown> = {};
      
      if ('name' in updatesSource) updatePayload.name = updatesSource.name;
      if ('clientName' in updatesSource) updatePayload.clientName = updatesSource.clientName;
      if ('address' in updatesSource) updatePayload.address = updatesSource.address;
      if ('description' in updatesSource) updatePayload.description = updatesSource.description;
      if ('status' in updatesSource) updatePayload.status = updatesSource.status;
      if ('startDate' in updatesSource) updatePayload.startDate = updatesSource.startDate;
      if ('endDate' in updatesSource) updatePayload.endDate = updatesSource.endDate;
      if ('revenue' in updatesSource) updatePayload.revenue = updatesSource.revenue;
      if ('expenses' in updatesSource) updatePayload.expenses = updatesSource.expenses;
      if ('profit' in updatesSource) updatePayload.profit = updatesSource.profit;

      const job = await financialRepository.updateJob(supabase, userId, jobId, updatePayload);

      return {
        mutated: true,
        detail: detailFallback ?? 'Contrat mis à jour.',
        payload: { jobId: job.id },
      };
    }
    case 'update_job_status': {
      const data = action.data ?? {};
      const jobId = await resolveJobId(supabase, userId, {
        jobId: data.jobId,
        jobName: data.jobName,
      });
      const job = await financialRepository.updateJob(supabase, userId, jobId, {
        status: normalizeNullableString(data.status),
      });
      return {
        mutated: true,
        detail: detailFallback ?? 'Statut du contrat mis à jour.',
        payload: { jobId: job.id, status: job.status },
      };
    }
    case 'delete_job': {
      const data = action.data ?? {};
      const jobId = await resolveJobId(supabase, userId, {
        jobId: data.jobId,
        jobName: data.jobName,
      });
      await financialRepository.deleteJob(supabase, userId, jobId);
      return {
        mutated: true,
        detail: detailFallback ?? 'Contrat supprimé.',
        payload: { jobId },
      };
    }
    case 'create_expense': {
      const data = action.data ?? {};
      const name =
        normalizeNullableString(data.name) ??
        normalizeNullableString(data.expenseName) ??
        normalizeNullableString(data.vendor);
      if (!name) {
        throw new HttpError('Le nom de la dépense est requis.', 400);
      }
      let jobId: string | null = null;
      if (data.jobId || data.jobName) {
        jobId = await resolveJobId(supabase, userId, {
          jobId: data.jobId,
          jobName: data.jobName,
        });
      }

      const { expense, updatedJob } = await financialRepository.createExpense(supabase, userId, {
        id: normalizeNullableString(data.expenseId),
        name,
        amount: data.amount ?? null,
        category: data.category as string | null,
        date: data.date as string | null,
        jobId,
        vendor: data.vendor as string | null,
        notes: data.notes as string | null,
        receiptPath: data.receiptImage as string | null,
      });

      return {
        mutated: true,
        detail: detailFallback ?? `Dépense « ${expense.name} » créée.`,
        payload: {
          expenseId: expense.id,
          jobId: updatedJob?.id ?? null,
        },
      };
    }
    case 'update_expense': {
      const data = action.data ?? {};
      const expenseId = await resolveExpenseId(supabase, userId, {
        expenseId: data.expenseId,
        expenseName: data.expenseName ?? (data as Record<string, unknown>).name,
      });
      
      // Ensure updates is an object and filter out undefined/null/empty string values
      const rawUpdates = data.updates && typeof data.updates === 'object' 
        ? (data.updates as Record<string, unknown>) 
        : {};
      
      // Filter out undefined, null, and empty string values to avoid validation errors
      const updates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rawUpdates)) {
        // Only include the field if it has a meaningful value
        // Allow null explicitly for jobId (to detach expense from job)
        if (key === 'jobId' && value === null) {
          updates[key] = null;
        } else if (value !== undefined && value !== null && value !== '') {
          // Additional check: if it's a string, make sure it's not just whitespace
          if (typeof value === 'string' && value.trim() === '') {
            continue; // Skip empty/whitespace-only strings
          }
          updates[key] = value;
        }
      }
      
      let jobId: string | null | undefined;
      if (updates.jobId === null) {
        jobId = null;
      } else if (updates.jobId || updates.jobName) {
        jobId = await resolveJobId(supabase, userId, {
          jobId: updates.jobId,
          jobName: updates.jobName,
        });
      }

      // Only pass fields that are actually in the filtered updates object
      // This ensures we never pass empty/null values that could trigger validation errors
      const updatePayload: {
        name?: string | null;
        amount?: number | string | null;
        category?: string | null;
        date?: string | null;
        jobId?: string | null | undefined;
        vendor?: string | null;
        notes?: string | null;
        receiptPath?: string | null;
      } = {};

      if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
        updatePayload.name = updates.name as string | null;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'amount')) {
        updatePayload.amount = updates.amount as number | string | null;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'category')) {
        updatePayload.category = updates.category as string | null;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'date')) {
        updatePayload.date = updates.date as string | null;
      }
      if (jobId !== undefined) {
        updatePayload.jobId = jobId;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'vendor')) {
        updatePayload.vendor = updates.vendor as string | null;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'notes')) {
        updatePayload.notes = updates.notes as string | null;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'receiptImage')) {
        updatePayload.receiptPath = updates.receiptImage as string | null;
      }

      const { expense, updatedJobs } = await financialRepository.updateExpense(supabase, userId, expenseId, updatePayload);

      return {
        mutated: true,
        detail: detailFallback ?? 'Dépense mise à jour.',
        payload: { expenseId: expense.id, updatedJobs: updatedJobs.map((job) => job.id) },
      };
    }
    case 'delete_expense': {
      const data = action.data ?? {};
      const expenseId = await resolveExpenseId(supabase, userId, {
        expenseId: data.expenseId,
        expenseName: data.expenseName,
      });
      const { updatedJob } = await financialRepository.deleteExpense(supabase, userId, expenseId);
          return {
            mutated: true,
        detail: detailFallback ?? 'Dépense supprimée.',
        payload: { expenseId, updatedJobId: updatedJob?.id ?? null },
      };
    }
    case 'attach_expense': {
      const data = action.data ?? {};
      const expenseId = await resolveExpenseId(supabase, userId, {
        expenseId: data.expenseId,
        expenseName: data.expenseName,
      });
      const jobId = await resolveJobId(supabase, userId, {
        jobId: data.jobId,
        jobName: data.jobName,
      });
      const { expense, updatedJobs } = await financialRepository.attachExpenseToJob(supabase, userId, expenseId, jobId);
      return {
        mutated: true,
        detail: detailFallback ?? 'Dépense associée au contrat.',
        payload: { expenseId: expense.id, jobIds: updatedJobs.map((job) => job.id) },
      };
    }
    case 'detach_expense': {
      const data = action.data ?? {};
      const expenseId = await resolveExpenseId(supabase, userId, {
        expenseId: data.expenseId,
        expenseName: data.expenseName,
      });
      const { expense, updatedJobs } = await financialRepository.detachExpenseFromJob(supabase, userId, expenseId);
      return {
        mutated: true,
        detail: detailFallback ?? 'Dépense détachée du contrat.',
        payload: { expenseId: expense.id, jobIds: updatedJobs.map((job) => job.id) },
      };
    }
    case 'create_category': {
      const data = action.data ?? {};
      const name = normalizeNullableString(data.name);
      if (!name) {
        throw new HttpError('Le nom de la catégorie est requis.', 400);
      }
      await catalogRepository.upsertCategory(supabase, userId, name);
      return {
        mutated: true,
        detail: detailFallback ?? `Catégorie « ${name} » ajoutée.`,
      };
    }
    case 'rename_category': {
      const data = action.data ?? {};
      const current = normalizeNullableString(data.categoryName);
      const next = normalizeNullableString(data.nextName);
      if (!current || !next) {
        throw new HttpError('Les noms de catégorie sont requis.', 400);
      }
      await catalogRepository.renameCategory(supabase, userId, current, next);
      return {
        mutated: true,
        detail: detailFallback ?? `Catégorie renommée en « ${next} ».`,
      };
    }
    case 'delete_category': {
      const data = action.data ?? {};
      const name = normalizeNullableString(data.categoryName);
      if (!name) {
        throw new HttpError('Le nom de la catégorie est requis.', 400);
      }
      await catalogRepository.deleteCategory(supabase, userId, name);
      return {
        mutated: true,
        detail: detailFallback ?? `Catégorie « ${name} » supprimée.`,
      };
    }
    case 'create_notification': {
      const data = action.data ?? {};
      const message = normalizeNullableString(data.message);
      if (!message) {
        throw new HttpError('Le message de notification est requis.', 400);
      }
      let jobId: string | null = null;
      if (data.jobId || data.jobName) {
        jobId = await resolveJobId(supabase, userId, {
          jobId: data.jobId,
          jobName: data.jobName,
        });
      }
      const notification = await catalogRepository.createNotification(supabase, userId, {
        message,
        type: normalizeNullableString(data.type),
        jobId,
      });
      return {
        mutated: true,
        detail: detailFallback ?? 'Notification créée.',
        payload: { notificationId: notification.id },
      };
    }
    case 'mark_notification_read': {
      const data = action.data ?? {};
      await catalogRepository.markNotificationRead(supabase, userId, {
        notificationId: normalizeNullableString(data.notificationId),
        notificationMessage: normalizeNullableString(data.notificationMessage),
      });
      return {
        mutated: true,
        detail: detailFallback ?? 'Notification marquée comme lue.',
      };
    }
    case 'delete_notification': {
      const data = action.data ?? {};
      await catalogRepository.deleteNotification(supabase, userId, {
        notificationId: normalizeNullableString(data.notificationId),
        notificationMessage: normalizeNullableString(data.notificationMessage),
      });
      return {
        mutated: true,
        detail: detailFallback ?? 'Notification supprimée.',
      };
    }
    case 'query': {
      return {
        mutated: false,
        detail: detailFallback ?? 'Réponse fournie sans modification.',
      };
    }
    default:
      throw new HttpError(`Action IA "${action.action}" non prise en charge.`, 400);
  }
};

/**
 * Attempts to rollback completed actions in case of failure
 * Returns count of successfully rolled back actions
 */
async function attemptRollback(
  supabase: SupabaseClient,
  userId: string,
  completedActions: Array<{ action: SanitizedAction; payload: unknown }>,
  logger: ReturnType<typeof createLogger>
): Promise<{ success: boolean; count: number; message: string; durationMs: number }> {
  const startTime = performance.now();
  let rollbackCount = 0;
  
  // Reverse order - rollback most recent first
  const actionsToRollback = [...completedActions].reverse();
  
  for (const { action, payload } of actionsToRollback) {
    try {
      // Attempt to rollback based on action type
      switch (action.action) {
        case 'create_job':
          if (payload && typeof payload === 'object' && 'jobId' in payload) {
            await financialRepository.deleteJob(supabase, userId, payload.jobId as string);
            rollbackCount++;
          }
          break;
        case 'create_expense':
          if (payload && typeof payload === 'object' && 'expenseId' in payload) {
            await financialRepository.deleteExpense(supabase, userId, payload.expenseId as string);
            rollbackCount++;
          }
          break;
        case 'create_category':
          // Categories are less critical, skip rollback for now
          logger.info('Skipping category rollback (low priority)');
          break;
        case 'create_notification':
          if (payload && typeof payload === 'object' && 'notificationId' in payload) {
            await catalogRepository.deleteNotification(supabase, userId, {
              notificationId: payload.notificationId as string,
              notificationMessage: null
            });
            rollbackCount++;
          }
          break;
        // For update actions, we can't easily rollback without storing previous state
        // This is a known limitation
        case 'update_job':
        case 'update_expense':
          logger.warn('Cannot rollback update action without previous state', { action: action.action });
          break;
        default:
          logger.info('No rollback handler for action', { action: action.action });
      }
    } catch (rollbackError) {
      logger.error('Rollback failed for action', {
        action: action.action,
        error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
      });
    }
  }
  
  const durationMs = performance.now() - startTime;
  const success = rollbackCount === completedActions.length;
  
  return {
    success,
    count: rollbackCount,
    message: success
      ? `Toutes les ${rollbackCount} actions ont été annulées.`
      : `${rollbackCount}/${completedActions.length} actions ont été annulées. Certaines modifications persistent.`,
    durationMs
  };
}

serve(async (req) => {
  const origin = resolveAllowedOrigin(req.headers.get('origin'));
  if (req.method === 'OPTIONS') {
    return handleOptions(origin);
  }
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, mutated: false, log: [], error: 'Méthode non autorisée.' }, { origin, status: 405 });
  }

  const correlationId = req.headers.get('x-correlation-id') ?? crypto.randomUUID();
  const logger = createLogger({ correlationId, function: 'ai-actions' });

  const supabaseUrl = getEnvVar('SUPABASE_URL');
  const serviceKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');

  let payload: { actions?: unknown };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(
      { success: false, mutated: false, log: [], error: 'Corps JSON invalide.' },
      { origin, status: 400 },
    );
  }

  const rawActions = Array.isArray(payload.actions) ? payload.actions : [];
  if (!rawActions.length) {
    return jsonResponse({ success: true, mutated: false, log: [] }, { origin });
  }

  const authorization = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
  const supabase = createClient(supabaseUrl, serviceKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse(
      { success: false, mutated: false, log: [], error: 'Non autorisé.' },
      { origin, status: 401 },
    );
  }
  const userId = userData.user.id;

  // Check rate limit
  checkRateLimit(userId, 'ai-actions', RATE_LIMITS.AI_ACTIONS);

  let actions: SanitizedAction[];
  try {
    actions = sanitizeActions(rawActions);
  } catch (validationError) {
    const normalised = normaliseError(validationError);
    return jsonResponse(
      { success: false, mutated: false, log: [], error: normalised.message },
      { origin, status: normalised.status },
    );
  }

  const logs: ActionExecutionLogEntry[] = [];
  let mutated = false;
  const startedAt = performance.now();
  const completedActions: Array<{ action: SanitizedAction; payload: unknown }> = [];

    try {
    // Execute actions sequentially using Supabase client
    // Track completed actions for potential rollback
    for (const action of actions) {
      const actionStartedAt = performance.now();
      try {
        const result = await executeAction(supabase, userId, action);
        mutated = mutated || result.mutated;
        
        // Track completed actions for rollback capability
        completedActions.push({
          action,
          payload: result.payload
        });
        
        logs.push({
          action: action.action,
          status: 'success',
          detail: result.detail,
          payload: result.payload ?? null,
          elapsedMs: performance.now() - actionStartedAt,
        });
      } catch (actionError) {
        const normalised = normaliseError(actionError);
        logs.push({
          action: action.action,
          status: 'failed',
          detail: normalised.message,
          payload: action.data ?? null,
          elapsedMs: performance.now() - actionStartedAt,
        });
        
        // If we've completed some actions before this failure, attempt rollback
        if (completedActions.length > 0 && mutated) {
          logger.warn('Action failed after mutations, attempting rollback', {
            failedAction: action.action,
            completedCount: completedActions.length,
            error: normalised.message
          });
          
          // Attempt to rollback completed actions in reverse order
          const rollbackResults = await attemptRollback(supabase, userId, completedActions, logger);
          
          // Add rollback info to logs
          logs.push({
            action: '__rollback__',
            status: rollbackResults.success ? 'success' : 'failed',
            detail: rollbackResults.message,
            payload: { rolledBack: rollbackResults.count, attempted: completedActions.length },
            elapsedMs: rollbackResults.durationMs
          });
          
          if (!rollbackResults.success) {
            normalised.message += ` (Attention: ${rollbackResults.count}/${completedActions.length} actions annulées avec succès. Certaines modifications peuvent persister.)`;
          } else {
            normalised.message += ` (Toutes les actions ont été annulées avec succès.)`;
          }
        }
        
        throw normalised;
      }
    }

    const durationMs = performance.now() - startedAt;
    recordMetric({
      correlationId,
      functionName: 'ai-actions',
      durationMs,
      success: true,
      userId,
      actionCount: actions.length,
    }).catch(() => {});

    logger.info('AI actions executed successfully', {
      actionCount: actions.length,
      mutated,
      durationMs,
    });

    return jsonResponse({ success: true, mutated, log: logs }, { origin });
    } catch (error) {
    const normalised = normaliseError(error);
    const durationMs = performance.now() - startedAt;
    recordMetric({
      correlationId,
      functionName: 'ai-actions',
      durationMs,
      success: false,
      userId,
      actionCount: actions.length,
      errorCode: normalised.code ?? undefined,
      errorMessage: normalised.message,
    }).catch(() => {});

    logger.error('AI actions failed', {
      error: normalised.message,
      status: normalised.status,
      detail: normalised.detail,
    });

    return jsonResponse(
      {
        success: false,
        mutated,
        log: logs,
        error: normalised.message,
      },
      { origin, status: normalised.status },
    );
  }
});
