import { supabase } from './supabaseClient';
import { mapJobFromDb, mapExpenseFromDb } from './dataService';
import type { Job, Expense } from '../types';
import { 
  createJobSchema, 
  updateJobSchema, 
  createExpenseSchema, 
  updateExpenseSchema,
  validateData,
  formatValidationErrors
} from './validation';
import { withRetryAndTimeout } from './retry';
import { translateError, formatErrorForUser } from './errors';

interface FinancialRequest {
  action: string;
  payload: Record<string, any>;
}

const invokeFinancialFunction = async <T = any>(request: FinancialRequest): Promise<T> => {
  console.log(`[FinancialService] Invoking ${request.action}`, {
    action: request.action,
    payload: request.payload,
    timestamp: new Date().toISOString(),
  });
  
  return withRetryAndTimeout(
    async () => {
      const { data, error } = await supabase.functions.invoke('financial-sync', {
        body: request,
      });

      if (error) {
        console.error('[FinancialService] Function invocation error:', {
          action: request.action,
          error: error,
          context: (error as any).context,
          message: error.message,
          status: (error as any).status,
          timestamp: new Date().toISOString(),
        });
        
        // Translate error to French
        const appError = translateError(error);
        const backendError = (error as any).context?.error || error.message;
        throw new Error(formatErrorForUser(appError) || `Action ${request.action} a échoué: ${backendError}`);
      }

      // Check if the response contains an error
      if (data && typeof data === 'object' && 'error' in data) {
        console.error('[FinancialService] Function returned error in data:', {
          action: request.action,
          data,
          timestamp: new Date().toISOString(),
        });
        const appError = translateError((data as any).error);
        throw new Error(formatErrorForUser(appError) || `Action ${request.action} a échoué: ${(data as any).error}`);
      }

      console.log(`[FinancialService] Success for ${request.action}`, {
        action: request.action,
        hasData: Boolean(data),
        timestamp: new Date().toISOString(),
      });

      return data as T;
    },
    {
      maxRetries: 3,
      initialDelayMs: 1000,
      timeoutMs: 30000, // 30 second timeout
      onRetry: (error, attempt, delayMs) => {
        console.warn(`Nouvelle tentative de l'action ${request.action} (tentative ${attempt}) dans ${delayMs}ms`, {
          error: error instanceof Error ? error.message : String(error),
        });
      },
    }
  );
};

export const financialService = {
  async createJob(job: Job) {
    try {
      // Validate input before making API call
      const validation = validateData(createJobSchema, job);
      if (!validation.success) {
        const errorMessage = formatValidationErrors(validation.errors);
        console.error('Job validation failed:', validation.errors);
        throw new Error(errorMessage);
      }
      
      const record = await invokeFinancialFunction<any>({
        action: 'create_job',
        payload: validation.data,
      });
      
      if (!record) {
        throw new Error('Aucune réponse du serveur lors de la création du contrat.');
      }
      
      return mapJobFromDb(record);
    } catch (error) {
      console.error('createJob error:', error);
      throw error;
    }
  },

  async updateJob(job: Partial<Job> & { id: string }) {
    try {
      // Validate input before making API call
      const validation = validateData(updateJobSchema, job);
      if (!validation.success) {
        const errorMessage = formatValidationErrors(validation.errors);
        console.error('Job update validation failed:', validation.errors);
        throw new Error(errorMessage);
      }
      
      const payload: Record<string, unknown> = { id: validation.data.id };

      if (validation.data.name !== undefined) {
        payload.name = validation.data.name;
      }
      if (validation.data.clientName !== undefined) {
        payload.clientName = validation.data.clientName;
      }
      if (validation.data.address !== undefined) {
        payload.address = validation.data.address;
      }
      if (validation.data.description !== undefined) {
        payload.description = validation.data.description;
      }
      if (validation.data.status !== undefined) {
        payload.status = validation.data.status;
      }
      if (validation.data.startDate !== undefined) {
        payload.startDate = validation.data.startDate;
      }
      if (validation.data.endDate !== undefined) {
        payload.endDate = validation.data.endDate;
      }
      if (validation.data.revenue !== undefined) {
        payload.revenue = validation.data.revenue;
      }
      if (validation.data.expenses !== undefined) {
        payload.expenses = validation.data.expenses;
      }
      if (validation.data.profit !== undefined) {
        payload.profit = validation.data.profit;
      }

      const record = await invokeFinancialFunction<any>({
        action: 'update_job',
        payload,
      });
      
      if (!record) {
        throw new Error('Aucune réponse du serveur lors de la mise à jour du contrat.');
      }
      
      return mapJobFromDb(record);
    } catch (error) {
      console.error('updateJob error:', error);
      throw error;
    }
  },

  async deleteJob(jobId: string) {
    console.log('[FinancialService] Deleting job:', {
      jobId,
      timestamp: new Date().toISOString(),
    });
    
    try {
      await invokeFinancialFunction({
        action: 'delete_job',
        payload: { id: jobId },
      });
      
      console.log('[FinancialService] Job deleted successfully:', {
        jobId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[FinancialService] Delete job failed:', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  },

  async updateJobStatus(jobId: string, status: Job['status']) {
    const record = await invokeFinancialFunction<any>({
      action: 'update_job_status',
      payload: { id: jobId, status },
    });
    return mapJobFromDb(record);
  },

  async createExpense(expense: Expense) {
    try {
      // Validate input before making API call
      const validation = validateData(createExpenseSchema, expense);
      if (!validation.success) {
        const errorMessage = formatValidationErrors(validation.errors);
        console.error('Expense validation failed:', validation.errors);
        throw new Error(errorMessage);
      }
      
      const response = await invokeFinancialFunction<{ updatedJob?: any }>({
        action: 'create_expense',
        payload: {
          ...validation.data,
          jobId: validation.data.jobId || null,
          receiptPath: null,
        },
      });
      
      if (response?.updatedJob) {
        return mapJobFromDb(response.updatedJob);
      }
      return null;
    } catch (error) {
      console.error('createExpense error:', error);
      throw error;
    }
  },

  async deleteExpense(expenseId: string) {
    console.log('[FinancialService] Deleting expense:', {
      expenseId,
      timestamp: new Date().toISOString(),
    });
    
    try {
      const response = await invokeFinancialFunction<{ updatedJob?: any }>({
        action: 'delete_expense',
        payload: { id: expenseId },
      });
      
      console.log('[FinancialService] Expense deleted successfully:', {
        expenseId,
        hasUpdatedJob: Boolean(response?.updatedJob),
        timestamp: new Date().toISOString(),
      });
      
      if (response?.updatedJob) {
        return mapJobFromDb(response.updatedJob);
      }
      return null;
    } catch (error) {
      console.error('[FinancialService] Delete expense failed:', {
        expenseId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  },

  async updateExpense(expense: Partial<Expense> & { id: string }) {
    try {
      // Validate input before making API call
      const validation = validateData(updateExpenseSchema, expense);
      if (!validation.success) {
        const errorMessage = formatValidationErrors(validation.errors);
        console.error('Expense update validation failed:', validation.errors);
        throw new Error(errorMessage);
      }
      
      const payload: Record<string, unknown> = { id: validation.data.id };

      if (validation.data.name !== undefined) {
        payload.name = validation.data.name;
      }
      if (validation.data.amount !== undefined) {
        payload.amount = validation.data.amount;
      }
      if (validation.data.category !== undefined) {
        payload.category = validation.data.category;
      }
      if (validation.data.date !== undefined) {
        payload.date = validation.data.date;
      }
      if (validation.data.jobId !== undefined) {
        payload.jobId = validation.data.jobId;
      }
      if (validation.data.vendor !== undefined) {
        payload.vendor = validation.data.vendor;
      }
      if (validation.data.notes !== undefined) {
        payload.notes = validation.data.notes;
      }
      if (validation.data.receiptImage !== undefined) {
        payload.receiptPath = validation.data.receiptImage;
      }

      const response = await invokeFinancialFunction<{ updatedExpense?: any; updatedJobs?: any[] }>({
        action: 'update_expense',
        payload,
      });

      const updatedExpense = response?.updatedExpense ? mapExpenseFromDb(response.updatedExpense) : null;
      const updatedJobs = (response?.updatedJobs ?? []).map(mapJobFromDb);

      return { updatedExpense, updatedJobs };
    } catch (error) {
      console.error('updateExpense error:', error);
      throw error;
    }
  },
};

