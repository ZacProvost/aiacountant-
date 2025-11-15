import { z } from 'zod';
import { JobStatus } from '../types';

/**
 * Validation schemas for financial data using Zod
 * These ensure data integrity before making API calls
 */

// Custom error messages in French
const errorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.expected === 'string') return { message: 'Ce champ doit être du texte' };
      if (issue.expected === 'number') return { message: 'Ce champ doit être un nombre' };
      return { message: 'Type de données invalide' };
    case z.ZodIssueCode.too_small:
      if (issue.type === 'string') return { message: `Minimum ${issue.minimum} caractères requis` };
      if (issue.type === 'number') return { message: `La valeur doit être au moins ${issue.minimum}` };
      return { message: 'Valeur trop petite' };
    case z.ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `Maximum ${issue.maximum} caractères autorisés` };
      if (issue.type === 'number') return { message: `La valeur ne peut pas dépasser ${issue.maximum}` };
      return { message: 'Valeur trop grande' };
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: 'Adresse courriel invalide' };
      if (issue.validation === 'url') return { message: 'URL invalide' };
      return { message: 'Format invalide' };
    default:
      return { message: ctx.defaultError };
  }
};

z.setErrorMap(errorMap);

// Base schemas
export const amountSchema = z.union([z.number(), z.string()])
  .transform((val) => {
    if (typeof val === 'string') {
      // Remove currency symbols and spaces
      const cleaned = val.replace(/[^\d.,-]/g, '');
      // Handle comma as decimal separator (French format)
      const normalized = cleaned.replace(',', '.');
      const parsed = parseFloat(normalized);
      return isNaN(parsed) ? 0 : parsed;
    }
    return Number(val);
  })
  .pipe(z.number().positive('Le montant doit être positif').max(99999999, 'Le montant est trop élevé').finite('Le montant doit être un nombre valide'));

export const optionalAmountSchema = z.union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((val) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'string') {
      const cleaned = val.replace(/[^\d.,-]/g, '');
      const normalized = cleaned.replace(',', '.');
      const parsed = parseFloat(normalized);
      return isNaN(parsed) ? 0 : parsed;
    }
    return Number(val);
  })
  .pipe(z.number().nonnegative('Le montant ne peut pas être négatif').max(99999999, 'Le montant est trop élevé').finite('Le montant doit être un nombre valide').optional().nullable());

export const dateSchema = z.union([z.string(), z.date()])
  .transform((val) => {
    if (val instanceof Date) {
      return val.toISOString().split('T')[0];
    }
    // Try to parse various date formats
    const str = String(val).trim();
    if (!str) return null;
    
    // Check if already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) return str;
    }
    
    // Try to parse as Date
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
    
    return null;
  })
  .refine((date) => date !== null, 'Date invalide');

export const optionalDateSchema = z.union([z.string(), z.date(), z.null(), z.undefined()])
  .transform((val) => {
    if (val === null || val === undefined || val === '') return null;
    if (val instanceof Date) {
      return val.toISOString().split('T')[0];
    }
    const str = String(val).trim();
    if (!str) return null;
    
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) return str;
    }
    
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
    
    return null;
  })
  .optional()
  .nullable();

export const jobIdSchema = z.string()
  .min(1, 'Identifiant de contrat requis')
  .max(100, 'Identifiant de contrat trop long');

export const expenseIdSchema = z.string()
  .min(1, 'Identifiant de dépense requis')
  .max(100, 'Identifiant de dépense trop long');

export const categorySchema = z.string()
  .min(1, 'La catégorie est requise')
  .max(50, 'Nom de catégorie trop long');

export const jobStatusSchema = z.nativeEnum(JobStatus, {
  errorMap: () => ({ message: 'Statut invalide. Utilisez: En cours, Terminé, ou Payé' })
});

// Job validation schemas
export const createJobSchema = z.object({
  id: z.string().optional(),
  name: z.string()
    .min(1, 'Le nom du contrat est requis')
    .max(200, 'Nom trop long')
    .transform((val) => val.trim()),
  clientName: z.union([z.string(), z.null(), z.undefined()])
    .transform((val) => val ? String(val).trim() : null)
    .refine((val) => !val || val.length <= 200, 'Nom du client trop long')
    .optional()
    .nullable(),
  address: z.union([z.string(), z.null(), z.undefined()])
    .transform((val) => val ? String(val).trim() : null)
    .refine((val) => !val || val.length <= 500, 'Adresse trop longue')
    .optional()
    .nullable(),
  description: z.union([z.string(), z.null(), z.undefined()])
    .transform((val) => val ? String(val).trim() : null)
    .refine((val) => !val || val.length <= 2000, 'Description trop longue')
    .optional()
    .nullable(),
  status: jobStatusSchema.default(JobStatus.InProgress),
  revenue: amountSchema,
  expenses: optionalAmountSchema.default(0),
  profit: optionalAmountSchema,
  startDate: optionalDateSchema,
  endDate: optionalDateSchema,
}).transform((data) => {
  // Auto-calculate profit if not provided
  if (data.profit === undefined || data.profit === null || data.profit === 0) {
    const expenses = data.expenses ?? 0;
    data.profit = data.revenue - expenses;
  }
  return data;
}).refine((data) => {
  // If both dates are provided, start must be before or equal to end
  if (data.startDate && data.endDate) {
    return new Date(data.startDate) <= new Date(data.endDate);
  }
  return true;
}, {
  message: 'La date de début doit être avant la date de fin',
  path: ['endDate']
});

export const updateJobSchema = z.object({
  id: z.string().min(1, 'Identifiant de contrat requis'),
  name: z.union([z.string(), z.undefined()])
    .transform((val) => val ? String(val).trim() : undefined)
    .refine((val) => !val || (val.length > 0 && val.length <= 200), 'Nom du contrat invalide')
    .optional(),
  clientName: z.union([z.string(), z.null(), z.undefined()])
    .transform((val) => val ? String(val).trim() : null)
    .refine((val) => !val || val.length <= 200, 'Nom du client trop long')
    .optional()
    .nullable(),
  address: z.union([z.string(), z.null(), z.undefined()])
    .transform((val) => val ? String(val).trim() : null)
    .refine((val) => !val || val.length <= 500, 'Adresse trop longue')
    .optional()
    .nullable(),
  description: z.union([z.string(), z.null(), z.undefined()])
    .transform((val) => val ? String(val).trim() : null)
    .refine((val) => !val || val.length <= 2000, 'Description trop longue')
    .optional()
    .nullable(),
  status: jobStatusSchema.optional(),
  revenue: z.union([amountSchema, z.undefined()]).optional(),
  expenses: optionalAmountSchema,
  profit: optionalAmountSchema,
  startDate: optionalDateSchema,
  endDate: optionalDateSchema,
}).refine((data) => {
  if (data.startDate && data.endDate) {
    return new Date(data.startDate) <= new Date(data.endDate);
  }
  return true;
}, {
  message: 'La date de début doit être avant la date de fin',
  path: ['endDate']
});

// Expense validation schemas
export const createExpenseSchema = z.object({
  id: z.string().optional(),
  name: z.string()
    .min(1, 'Le nom de la dépense est requis')
    .max(200, 'Nom trop long')
    .transform((val) => val.trim()),
  amount: amountSchema,
  category: z.string()
    .min(1, 'La catégorie est requise')
    .max(50, 'Nom de catégorie trop long')
    .transform((val) => val.trim()),
  date: z.union([dateSchema, z.undefined()])
    .default(() => new Date().toISOString().split('T')[0]),
  jobId: z.union([z.string(), z.null(), z.undefined()])
    .transform((val) => {
      if (!val || val === '' || val === 'null' || val === 'undefined') return null;
      return String(val).trim();
    })
    .optional()
    .nullable(),
  vendor: z.union([z.string(), z.null(), z.undefined()])
    .transform((val) => val ? String(val).trim() : null)
    .refine((val) => !val || val.length <= 200, 'Nom du fournisseur trop long')
    .optional()
    .nullable(),
  notes: z.union([z.string(), z.null(), z.undefined()])
    .transform((val) => val ? String(val).trim() : null)
    .refine((val) => !val || val.length <= 1000, 'Notes trop longues')
    .optional()
    .nullable(),
  receiptImage: z.union([z.string(), z.null(), z.undefined()])
    .optional()
    .nullable(),
});

export const updateExpenseSchema = z.object({
  id: z.string().min(1, 'Identifiant de dépense requis'),
  name: z.union([z.string(), z.undefined()])
    .transform((val) => val ? String(val).trim() : undefined)
    .refine((val) => !val || (val.length > 0 && val.length <= 200), 'Nom de dépense invalide')
    .optional(),
  amount: z.union([amountSchema, z.undefined()]).optional(),
  category: z.union([z.string(), z.undefined()])
    .transform((val) => val ? String(val).trim() : undefined)
    .refine((val) => !val || (val.length > 0 && val.length <= 50), 'Catégorie invalide')
    .optional(),
  date: z.union([dateSchema, z.undefined()]).optional(),
  jobId: z.union([z.string(), z.null(), z.undefined()])
    .transform((val) => {
      if (!val || val === '' || val === 'null' || val === 'undefined') return null;
      return String(val).trim();
    })
    .optional()
    .nullable(),
  vendor: z.union([z.string(), z.null(), z.undefined()])
    .transform((val) => val ? String(val).trim() : null)
    .refine((val) => !val || val.length <= 200, 'Nom du fournisseur trop long')
    .optional()
    .nullable(),
  notes: z.union([z.string(), z.null(), z.undefined()])
    .transform((val) => val ? String(val).trim() : null)
    .refine((val) => !val || val.length <= 1000, 'Notes trop longues')
    .optional()
    .nullable(),
  receiptImage: z.union([z.string(), z.null(), z.undefined()])
    .optional()
    .nullable(),
});

// Category validation
export const categoryNameSchema = z.string()
  .min(1, 'Le nom de la catégorie est requis')
  .max(50, 'Nom de catégorie trop long')
  .refine((name) => name.trim().length > 0, 'La catégorie ne peut pas être vide');

// Profile validation
export const userProfileSchema = z.object({
  name: z.string().min(1, 'Le nom est requis').max(100, 'Nom trop long'),
  email: z.string().email('Adresse courriel invalide').optional().nullable(),
  companyName: z.string().max(200, 'Nom de la compagnie trop long').optional().nullable(),
  taxRate: z.number()
    .min(0, 'Le taux de taxe doit être positif ou zéro')
    .max(100, 'Le taux de taxe ne peut pas dépasser 100%')
    .optional()
    .nullable(),
});

/**
 * Helper function to validate and format errors
 */
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: Array<{ field: string; message: string }> } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return { success: false, errors };
    }
    return {
      success: false,
      errors: [{ field: 'unknown', message: 'Erreur de validation' }],
    };
  }
}

/**
 * Helper to create user-friendly error messages
 */
export function formatValidationErrors(
  errors: Array<{ field: string; message: string }>
): string {
  if (errors.length === 0) return 'Erreur de validation';
  if (errors.length === 1) return errors[0].message;
  return `Erreurs de validation:\n${errors.map((e) => `• ${e.field}: ${e.message}`).join('\n')}`;
}

// Type exports for use in components
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type UserProfileInput = z.infer<typeof userProfileSchema>;


