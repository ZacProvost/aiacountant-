import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';
import { resolveAllowedOrigin } from '../_shared/cors.ts';
import { handleOptions, jsonResponse } from '../_shared/http.ts';
import { getEnvVar } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import { financialRepository } from '../_shared/financial.ts';
import { HttpError, normaliseError } from '../_shared/errors.ts';
import { normalizeNullableString } from '../_shared/normalise.ts';
import { checkRateLimit, RATE_LIMITS } from '../_shared/rateLimit.ts';

type FinancialAction =
  | 'create_job'
  | 'update_job'
  | 'delete_job'
  | 'update_job_status'
  | 'create_expense'
  | 'delete_expense'
  | 'update_expense'
  | 'recalculate_job';

const execute = async (client: SupabaseClient, userId: string, action: FinancialAction, payload: Record<string, unknown>) => {
  switch (action) {
    case 'create_job': {
      const job = await financialRepository.createJob(client, userId, {
        id: normalizeNullableString(payload.id),
        name: normalizeNullableString(payload.name),
        clientName: normalizeNullableString(payload.clientName),
        address: normalizeNullableString(payload.address),
        description: normalizeNullableString(payload.description),
        status: normalizeNullableString(payload.status),
        revenue: payload.revenue ?? payload.amount ?? null,
        expenses: payload.expenses ?? null,
        profit: payload.profit ?? null,
        startDate: normalizeNullableString(payload.startDate),
        endDate: normalizeNullableString(payload.endDate),
      });
      return job;
    }
    case 'update_job': {
      const jobId = normalizeNullableString(payload.id);
      if (!jobId) {
        throw new HttpError('Job id required', 400);
      }
      const job = await financialRepository.updateJob(client, userId, jobId, {
        name: payload.name as string | null | undefined,
        clientName: payload.clientName as string | null | undefined,
        address: payload.address as string | null | undefined,
        description: payload.description as string | null | undefined,
        status: payload.status as string | null | undefined,
        startDate: payload.startDate as string | null | undefined,
        endDate: payload.endDate as string | null | undefined,
        revenue: payload.revenue as number | string | null | undefined,
        expenses: payload.expenses as number | string | null | undefined,
        profit: payload.profit as number | string | null | undefined,
      });
      return job;
    }
    case 'delete_job': {
      const jobId = normalizeNullableString(payload.id);
      if (!jobId) {
        throw new HttpError('Job id required', 400);
      }
      await financialRepository.deleteJob(client, userId, jobId);
      return { success: true };
    }
    case 'update_job_status': {
      const jobId = normalizeNullableString(payload.id);
      if (!jobId) {
        throw new HttpError('Job id required', 400);
      }
      const job = await financialRepository.updateJob(client, userId, jobId, {
        status: payload.status as string | null | undefined,
      });
      return job;
    }
    case 'create_expense': {
      const { updatedJob } = await financialRepository.createExpense(client, userId, {
        id: normalizeNullableString(payload.id),
        name: normalizeNullableString(payload.name),
        amount: payload.amount as number | string | null | undefined,
        category: payload.category as string | null | undefined,
        date: payload.date as string | null | undefined,
        jobId: normalizeNullableString(payload.jobId),
        vendor: payload.vendor as string | null | undefined,
        notes: payload.notes as string | null | undefined,
        receiptPath: payload.receiptPath as string | null | undefined,
      });
      return { updatedJob };
    }
    case 'delete_expense': {
      const expenseId = normalizeNullableString(payload.id);
      if (!expenseId) {
        throw new HttpError('Expense id required', 400);
      }
      const { updatedJob } = await financialRepository.deleteExpense(client, userId, expenseId);
      return { updatedJob };
    }
    case 'update_expense': {
      const expenseId = normalizeNullableString(payload.id);
      if (!expenseId) {
        throw new HttpError('Expense id required', 400);
      }
      const { expense, updatedJobs } = await financialRepository.updateExpense(client, userId, expenseId, {
        name: payload.name as string | null | undefined,
        amount: payload.amount as number | string | null | undefined,
        category: payload.category as string | null | undefined,
        date: payload.date as string | null | undefined,
        jobId: payload.jobId as string | null | undefined,
        vendor: payload.vendor as string | null | undefined,
        notes: payload.notes as string | null | undefined,
        receiptPath: payload.receiptPath as string | null | undefined,
      });
      return { updatedExpense: expense, updatedJobs };
    }
    case 'recalculate_job': {
      const jobId = normalizeNullableString(payload.jobId);
      if (!jobId) {
        throw new HttpError('jobId required', 400);
      }
      const updatedJob = await financialRepository.recalculateJobTotals(client, userId, jobId);
      return { updatedJob };
    }
    default:
      throw new HttpError('Unsupported action', 400);
  }
};

serve(async (req) => {
  const origin = resolveAllowedOrigin(req.headers.get('origin'));
  if (req.method === 'OPTIONS') {
    return handleOptions(origin);
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Méthode non autorisée.' }, { origin, status: 405 });
  }

  const correlationId = req.headers.get('x-correlation-id') ?? crypto.randomUUID();
  const logger = createLogger({ correlationId, function: 'financial-sync' });

  const supabaseUrl = getEnvVar('SUPABASE_URL');
  const serviceKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(supabaseUrl, serviceKey, {
    global: {
      headers: {
        Authorization: req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '',
      },
    },
  });

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: userError?.message ?? 'Unauthorized' }, { origin, status: 401 });
    }

    const userId = userData.user.id;

    // Check rate limit
    checkRateLimit(userId, 'financial-sync', RATE_LIMITS.FINANCIAL_SYNC);

    const body = await req.json();
    const action = body?.action as FinancialAction | undefined;
    const payload = (body?.payload ?? {}) as Record<string, unknown>;

    if (!action) {
      throw new HttpError('Action manquante.', 400);
    }

    const startedAt = performance.now();
    
    // Use Supabase client for all operations
    // RLS is enforced through the Authorization header passed to the client
    // This ensures proper authentication and authorization for all CRUD operations
    const result = await execute(supabase, userId, action, payload);

    logger.info('Financial action executed', {
      action,
      durationMs: performance.now() - startedAt,
    });

    return jsonResponse(result ?? { success: true }, { origin });
  } catch (error) {
    const normalised = normaliseError(error);
    logger.error('Financial action failed', {
      error: normalised.message,
      status: normalised.status,
      detail: normalised.detail,
    });
    return jsonResponse({ error: normalised.message }, { origin, status: normalised.status });
  }
});

