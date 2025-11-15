import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';
import { HttpError } from './errors.ts';
import {
  ensurePositiveAmount,
  normalizeDateInput,
  normalizeNullableString,
  normalizeOptionalString,
  parseCurrencyAmount,
} from './normalise.ts';
import { generateId } from './ids.ts';

export interface JobRecord {
  id: string;
  user_id: string;
  name: string;
  client_name: string | null;
  address: string | null;
  description: string | null;
  status: string;
  revenue: number;
  expenses: number;
  profit: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseRecord {
  id: string;
  user_id: string;
  job_id: string | null;
  name: string;
  amount: number;
  category: string;
  date: string;
  vendor: string | null;
  notes: string | null;
  receipt_path: string | null;
  created_at: string;
  updated_at: string;
}

const fetchJobById = async (supabase: SupabaseClient, userId: string, jobId: string): Promise<JobRecord | null> => {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();
  
  if (error && error.code !== 'PGRST116') throw new HttpError(`Database error: ${error.message}`, 500);
  return data as JobRecord | null;
};

const fetchExpenseById = async (supabase: SupabaseClient, userId: string, expenseId: string): Promise<ExpenseRecord | null> => {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', expenseId)
    .eq('user_id', userId)
    .maybeSingle();
  
  if (error && error.code !== 'PGRST116') throw new HttpError(`Database error: ${error.message}`, 500);
  return data as ExpenseRecord | null;
};

const assertJobExists = async (supabase: SupabaseClient, userId: string, jobId: string): Promise<JobRecord> => {
  const job = await fetchJobById(supabase, userId, jobId);
  if (!job) {
    throw new HttpError('Contrat introuvable.', 404);
  }
  return job;
};

const assertExpenseExists = async (supabase: SupabaseClient, userId: string, expenseId: string): Promise<ExpenseRecord> => {
  const expense = await fetchExpenseById(supabase, userId, expenseId);
  if (!expense) {
    throw new HttpError('Dépense introuvable.', 404);
  }
  return expense;
};

const recalculateJobTotals = async (supabase: SupabaseClient, userId: string, jobId: string): Promise<JobRecord> => {
  const job = await assertJobExists(supabase, userId, jobId);

  const { data: expenseData, error: expenseError } = await supabase
    .from('expenses')
    .select('amount')
    .eq('job_id', jobId)
    .eq('user_id', userId);
  
  if (expenseError) throw new HttpError(`Database error: ${expenseError.message}`, 500);
  
  const totalExpenses = expenseData?.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) ?? 0;
  const profit = Number(job.revenue ?? 0) - totalExpenses;

  const { data: updated, error: updateError } = await supabase
    .from('jobs')
    .update({ expenses: totalExpenses, profit, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('user_id', userId)
    .select()
    .single();
  
  if (updateError) throw new HttpError(`Database error: ${updateError.message}`, 500);
  if (!updated) throw new HttpError('Failed to update job', 500);
  
  return updated as JobRecord;
};

interface CreateJobInput {
  id?: string | null;
  name: string | null;
  clientName?: string | null;
  address?: string | null;
  description?: string | null;
  status?: string | null;
  revenue: number | string | null;
  expenses?: number | string | null;
  profit?: number | string | null;
  startDate?: string | null;
  endDate?: string | null;
}

interface UpdateJobInput {
  name?: string | null;
  clientName?: string | null;
  address?: string | null;
  description?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  revenue?: number | string | null;
  expenses?: number | string | null;
  profit?: number | string | null;
}

export const createJob = async (supabase: SupabaseClient, userId: string, input: CreateJobInput): Promise<JobRecord> => {
  const jobId = normalizeOptionalString(input.id) ?? generateId('job');

  const name = normalizeNullableString(input.name);
  if (!name) {
    throw new HttpError('Le nom du contrat est requis.', 400);
  }

  const revenue = ensurePositiveAmount(input.revenue, `Impossible de créer le contrat « ${name} » : montant invalide.`);
  const expenses = Number.isFinite(Number(input.expenses)) ? Number(input.expenses ?? 0) : 0;
  const profit = Number.isFinite(Number(input.profit)) ? Number(input.profit ?? revenue - expenses) : revenue - expenses;

  const statusCandidate = normalizeNullableString(input.status) ?? 'En cours';
  const status = statusCandidate.length ? statusCandidate : 'En cours';

  const { data: existing } = await supabase
    .from('jobs')
    .select('user_id')
    .eq('id', jobId)
    .maybeSingle();

  if (existing && existing.user_id !== userId) {
    throw new HttpError('Identifiant de contrat déjà utilisé par un autre utilisateur.', 403);
  }

  // Default start_date to today if not provided
  const startDate = normalizeDateInput(input.startDate) ?? new Date().toISOString().split('T')[0];
  
  const jobData = {
    id: jobId,
    user_id: userId,
    name,
    client_name: normalizeNullableString(input.clientName),
    address: normalizeNullableString(input.address),
    description: normalizeNullableString(input.description),
    status,
    revenue,
    expenses,
    profit,
    start_date: startDate,
    end_date: normalizeDateInput(input.endDate),
    updated_at: new Date().toISOString(),
  };

  const { data: result, error } = await supabase
    .from('jobs')
    .upsert(jobData, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw new HttpError(`Database error: ${error.message}`, 500);
  if (!result) throw new HttpError('Failed to create job', 500);

  return result as JobRecord;
};

export const updateJob = async (
  supabase: SupabaseClient,
  userId: string,
  jobId: string,
  updates: UpdateJobInput,
): Promise<JobRecord> => {
  await assertJobExists(supabase, userId, jobId);

  const payload: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
    const name = normalizeNullableString(updates.name);
    if (!name) {
      throw new HttpError('Le nom du contrat ne peut pas être vide.', 400);
    }
    payload.name = name;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'clientName')) {
    payload.client_name = normalizeNullableString(updates.clientName);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'address')) {
    payload.address = normalizeNullableString(updates.address);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'description')) {
    payload.description = normalizeNullableString(updates.description);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
    const status = normalizeNullableString(updates.status);
    if (!status) {
      throw new HttpError('Le statut du contrat ne peut pas être vide.', 400);
    }
    payload.status = status;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'startDate')) {
    payload.start_date = normalizeDateInput(updates.startDate);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'endDate')) {
    payload.end_date = normalizeDateInput(updates.endDate);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'revenue')) {
    const amount = parseCurrencyAmount(updates.revenue);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new HttpError('Montant de revenu invalide.', 400);
    }
    payload.revenue = amount;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'expenses')) {
    const amount = parseCurrencyAmount(updates.expenses);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new HttpError('Montant de dépense invalide.', 400);
    }
    payload.expenses = amount;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'profit')) {
    const amount = parseCurrencyAmount(updates.profit);
    if (!Number.isFinite(amount)) {
      throw new HttpError('Profit invalide.', 400);
    }
    payload.profit = amount;
  }

  if (!Object.keys(payload).length) {
    throw new HttpError("Aucune mise à jour valide n'a été fournie pour le contrat.", 400);
  }

  payload.updated_at = new Date().toISOString();

  const { data: result, error } = await supabase
    .from('jobs')
    .update(payload)
    .eq('user_id', userId)
    .eq('id', jobId)
    .select()
    .single();

  if (error) throw new HttpError(`Database error: ${error.message}`, 500);
  if (!result) throw new HttpError('Impossible de mettre à jour le contrat.', 400);

  return result as JobRecord;
};

export const deleteJob = async (supabase: SupabaseClient, userId: string, jobId: string): Promise<void> => {
  const { data: result, error } = await supabase
    .from('jobs')
    .delete()
    .eq('user_id', userId)
    .eq('id', jobId)
    .select('id')
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw new HttpError(`Database error: ${error.message}`, 500);
  if (!result) {
    throw new HttpError('Contrat introuvable.', 404);
  }
};

interface CreateExpenseInput {
  id?: string | null;
  name: string | null;
  amount: number | string | null;
  category: string | null;
  date?: string | null;
  jobId?: string | null;
  vendor?: string | null;
  notes?: string | null;
  receiptPath?: string | null;
}

interface UpdateExpenseInput {
  name?: string | null;
  amount?: number | string | null;
  category?: string | null;
  date?: string | null;
  jobId?: string | null;
  vendor?: string | null;
  notes?: string | null;
  receiptPath?: string | null;
}

export const createExpense = async (
  supabase: SupabaseClient,
  userId: string,
  input: CreateExpenseInput,
): Promise<{ expense: ExpenseRecord; updatedJob?: JobRecord | null }> => {
  const expenseId = normalizeOptionalString(input.id) ?? generateId('exp');
  const name = normalizeNullableString(input.name);
  if (!name) {
    throw new HttpError('Le nom de la dépense est requis.', 400);
  }

  const amount = ensurePositiveAmount(input.amount, `Impossible de créer la dépense « ${name} » : montant invalide.`);

  let category = normalizeNullableString(input.category) ?? 'Autre';
  
  // Validate category: reject if it looks like an ID (exp-*, job-*, etc.) or is too long
  if (category.match(/^(exp|job|notif|conv)-[a-f0-9-]{30,}$/i) || category.length > 50) {
    console.warn(`[Financial] Invalid category detected: "${category}". Using default.`);
    category = 'Autre';
  }

  let jobId: string | null = null;
  if (input.jobId) {
    jobId = normalizeNullableString(input.jobId);
    if (jobId) {
      await assertJobExists(supabase, userId, jobId);
    }
  }

  const date = normalizeDateInput(input.date) ?? new Date().toISOString().split('T')[0];

  const expenseData = {
    id: expenseId,
    user_id: userId,
    job_id: jobId,
    name,
    amount,
    category,
    date,
    vendor: normalizeNullableString(input.vendor),
    notes: normalizeNullableString(input.notes),
    receipt_path: normalizeNullableString(input.receiptPath),
    updated_at: new Date().toISOString(),
  };

  const { data: expense, error } = await supabase
    .from('expenses')
    .upsert(expenseData, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw new HttpError(`Database error: ${error.message}`, 500);
  if (!expense) throw new HttpError('Failed to create expense', 500);

  let updatedJob: JobRecord | null = null;
  if (expense.job_id) {
    updatedJob = await recalculateJobTotals(supabase, userId, expense.job_id);
  }

  return { expense: expense as ExpenseRecord, updatedJob };
};

export const updateExpense = async (
  supabase: SupabaseClient,
  userId: string,
  expenseId: string,
  updates: UpdateExpenseInput,
): Promise<{ expense: ExpenseRecord; updatedJobs: JobRecord[] }> => {
  const existing = await assertExpenseExists(supabase, userId, expenseId);

  const payload: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
    const name = normalizeNullableString(updates.name);
    if (!name) {
      throw new HttpError('Le nom de la dépense ne peut pas être vide.', 400);
    }
    payload.name = name;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'amount')) {
    const amount = parseCurrencyAmount(updates.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new HttpError('Montant de dépense invalide.', 400);
    }
    if (amount === 0) {
      throw new HttpError('Le montant doit être supérieur à zéro. Utilisez la suppression pour retirer la dépense.', 400);
    }
    payload.amount = amount;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'category')) {
    let category = normalizeNullableString(updates.category);
    if (!category) {
      throw new HttpError('La catégorie ne peut pas être vide.', 400);
    }
    
    // Validate category: reject if it looks like an ID (exp-*, job-*, etc.) or is too long
    if (category.match(/^(exp|job|notif|conv)-[a-f0-9-]{30,}$/i) || category.length > 50) {
      console.warn(`[Financial] Invalid category detected in update: "${category}". Using default.`);
      category = 'Autre';
    }
    
    payload.category = category;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'date')) {
    payload.date = normalizeDateInput(updates.date) ?? new Date().toISOString().split('T')[0];
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'jobId')) {
    if (updates.jobId === null) {
      payload.job_id = null;
    } else {
      const jobId = normalizeNullableString(updates.jobId);
      if (!jobId) {
        payload.job_id = null;
      } else {
        await assertJobExists(supabase, userId, jobId);
        payload.job_id = jobId;
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'vendor')) {
    payload.vendor = normalizeNullableString(updates.vendor);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'notes')) {
    payload.notes = normalizeNullableString(updates.notes);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'receiptPath')) {
    payload.receipt_path = normalizeNullableString(updates.receiptPath);
  }

  if (!Object.keys(payload).length) {
    throw new HttpError("Aucune mise à jour valide n'a été fournie pour la dépense.", 400);
  }

  payload.updated_at = new Date().toISOString();

  const { data: updatedExpense, error } = await supabase
    .from('expenses')
    .update(payload)
    .eq('user_id', userId)
    .eq('id', expenseId)
    .select()
    .single();

  if (error) throw new HttpError(`Database error: ${error.message}`, 500);
  if (!updatedExpense) throw new HttpError("Impossible de mettre à jour la dépense.", 400);

  const jobIds = new Set<string>();
  if (existing.job_id) {
    jobIds.add(existing.job_id);
  }
  if (updatedExpense.job_id) {
    jobIds.add(updatedExpense.job_id);
  }

  const updatedJobs: JobRecord[] = [];
  for (const jobId of jobIds) {
    const job = await recalculateJobTotals(supabase, userId, jobId);
    updatedJobs.push(job);
  }

  return { expense: updatedExpense as ExpenseRecord, updatedJobs };
};

export const deleteExpense = async (
  supabase: SupabaseClient,
  userId: string,
  expenseId: string,
): Promise<{ updatedJob?: JobRecord | null }> => {
  const existing = await assertExpenseExists(supabase, userId, expenseId);

  const { data: result, error } = await supabase
    .from('expenses')
    .delete()
    .eq('user_id', userId)
    .eq('id', expenseId)
    .select('id')
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw new HttpError(`Database error: ${error.message}`, 500);
  if (!result) {
    throw new HttpError('Dépense introuvable.', 404);
  }

  if (existing.job_id) {
    const updatedJob = await recalculateJobTotals(supabase, userId, existing.job_id);
    return { updatedJob };
  }
  return { updatedJob: null };
};

export const detachExpenseFromJob = async (
  supabase: SupabaseClient,
  userId: string,
  expenseId: string,
): Promise<{ expense: ExpenseRecord; updatedJobs: JobRecord[] }> => {
  const existing = await assertExpenseExists(supabase, userId, expenseId);

  const { data: updatedExpense, error } = await supabase
    .from('expenses')
    .update({ job_id: null, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', expenseId)
    .select()
    .single();

  if (error) throw new HttpError(`Database error: ${error.message}`, 500);
  if (!updatedExpense) throw new HttpError('Failed to detach expense', 500);

  const updatedJobs: JobRecord[] = [];

  if (existing.job_id) {
    const job = await recalculateJobTotals(supabase, userId, existing.job_id);
    updatedJobs.push(job);
  }

  return { expense: updatedExpense as ExpenseRecord, updatedJobs };
};

export const attachExpenseToJob = async (
  supabase: SupabaseClient,
  userId: string,
  expenseId: string,
  jobId: string,
): Promise<{ expense: ExpenseRecord; updatedJobs: JobRecord[] }> => {
  await assertJobExists(supabase, userId, jobId);
  const existing = await assertExpenseExists(supabase, userId, expenseId);

  const { data: updatedExpense, error } = await supabase
    .from('expenses')
    .update({ job_id: jobId, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', expenseId)
    .select()
    .single();

  if (error) throw new HttpError(`Database error: ${error.message}`, 500);
  if (!updatedExpense) throw new HttpError('Failed to attach expense', 500);

  const updatedJobs: JobRecord[] = [];

  if (existing.job_id && existing.job_id !== jobId) {
    updatedJobs.push(await recalculateJobTotals(supabase, userId, existing.job_id));
  }
  updatedJobs.push(await recalculateJobTotals(supabase, userId, jobId));

  return { expense: updatedExpense as ExpenseRecord, updatedJobs };
};

export const financialRepository = {
  createJob,
  updateJob,
  deleteJob,
  createExpense,
  updateExpense,
  deleteExpense,
  recalculateJobTotals,
  detachExpenseFromJob,
  attachExpenseToJob,
};

