/**
 * Business rule validation for financial data
 * Ensures data integrity and catches unusual patterns
 */

import type { Job, Expense, JobStatus } from '../types';
import { logger } from './logging';

export interface ValidationWarning {
  field: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface ValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
  errors: ValidationWarning[];
}

/**
 * Validates a job's financial data
 */
export function validateJob(job: Job): ValidationResult {
  const warnings: ValidationWarning[] = [];
  const errors: ValidationWarning[] = [];

  // Rule: Revenue must be positive
  if (job.revenue <= 0) {
    errors.push({
      field: 'revenue',
      message: 'Le revenu doit être supérieur à zéro',
      severity: 'error',
    });
  }

  // Rule: Expenses cannot be negative
  if (job.expenses < 0) {
    errors.push({
      field: 'expenses',
      message: 'Les dépenses ne peuvent pas être négatives',
      severity: 'error',
    });
  }

  // Rule: Profit must match revenue - expenses
  const calculatedProfit = job.revenue - job.expenses;
  const profitDifference = Math.abs(job.profit - calculatedProfit);
  
  if (profitDifference > 0.01) {
    // Allow for tiny floating point differences
    warnings.push({
      field: 'profit',
      message: `Le profit (${job.profit.toFixed(2)}) ne correspond pas au calcul revenu - dépenses (${calculatedProfit.toFixed(2)})`,
      severity: 'warning',
    });
  }

  // Rule: Warn about negative profit
  if (job.profit < 0) {
    warnings.push({
      field: 'profit',
      message: 'Ce contrat génère une perte. Vérifiez les montants.',
      severity: 'warning',
    });
  }

  // Rule: Warn about very low profit margin (< 10%)
  const profitMargin = job.revenue > 0 ? (job.profit / job.revenue) * 100 : 0;
  if (profitMargin > 0 && profitMargin < 10) {
    warnings.push({
      field: 'profit',
      message: `Marge bénéficiaire faible (${profitMargin.toFixed(1)}%). Considérez une révision des prix.`,
      severity: 'warning',
    });
  }

  // Rule: Warn about expenses exceeding revenue
  if (job.expenses > job.revenue) {
    warnings.push({
      field: 'expenses',
      message: 'Les dépenses dépassent le revenu',
      severity: 'warning',
    });
  }

  // Rule: Start date should be before end date
  if (job.startDate && job.endDate) {
    const start = new Date(job.startDate);
    const end = new Date(job.endDate);
    
    if (start > end) {
      errors.push({
        field: 'endDate',
        message: 'La date de fin doit être après la date de début',
        severity: 'error',
      });
    }

    // Rule: Warn about very long jobs (> 1 year)
    const durationMs = end.getTime() - start.getTime();
    const durationDays = durationMs / (1000 * 60 * 60 * 24);
    
    if (durationDays > 365) {
      warnings.push({
        field: 'endDate',
        message: `Durée du contrat très longue (${Math.round(durationDays)} jours). Vérifiez les dates.`,
        severity: 'warning',
      });
    }
  }

  // Rule: Warn about very high revenue amounts (potential data entry error)
  if (job.revenue > 1000000) {
    warnings.push({
      field: 'revenue',
      message: 'Revenu inhabituellement élevé. Vérifiez le montant.',
      severity: 'warning',
    });
  }

  // Rule: Completed jobs should have an end date
  if (job.status === ('Terminé' as JobStatus) || job.status === ('Payé' as JobStatus)) {
    if (!job.endDate) {
      warnings.push({
        field: 'endDate',
        message: 'Les contrats terminés ou payés devraient avoir une date de fin',
        severity: 'warning',
      });
    }
  }

  // Rule: Paid jobs should not have negative profit
  if (job.status === ('Payé' as JobStatus) && job.profit < 0) {
    warnings.push({
      field: 'status',
      message: 'Un contrat payé ne devrait pas avoir un profit négatif',
      severity: 'warning',
    });
  }

  logger.debug('Job validation completed', {
    jobId: job.id,
    valid: errors.length === 0,
    warningCount: warnings.length,
    errorCount: errors.length,
  });

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Validates an expense
 */
export function validateExpense(expense: Expense): ValidationResult {
  const warnings: ValidationWarning[] = [];
  const errors: ValidationWarning[] = [];

  // Rule: Amount must be positive
  if (expense.amount <= 0) {
    errors.push({
      field: 'amount',
      message: 'Le montant de la dépense doit être positif',
      severity: 'error',
    });
  }

  // Rule: Warn about very high amounts (potential data entry error)
  if (expense.amount > 50000) {
    warnings.push({
      field: 'amount',
      message: 'Montant inhabituellement élevé. Vérifiez le montant.',
      severity: 'warning',
    });
  }

  // Rule: Date should not be in the future
  if (expense.date) {
    const expenseDate = new Date(expense.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (expenseDate > today) {
      warnings.push({
        field: 'date',
        message: 'La date de dépense est dans le futur',
        severity: 'warning',
      });
    }

    // Rule: Warn about very old expenses (> 2 years)
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    if (expenseDate < twoYearsAgo) {
      warnings.push({
        field: 'date',
        message: 'Dépense datant de plus de 2 ans',
        severity: 'warning',
      });
    }
  }

  // Rule: Category should not be empty
  if (!expense.category || expense.category.trim().length === 0) {
    warnings.push({
      field: 'category',
      message: 'Il est recommandé de spécifier une catégorie',
      severity: 'warning',
    });
  }

  // Rule: Name should be descriptive (at least 3 characters)
  if (expense.name.length < 3) {
    warnings.push({
      field: 'name',
      message: 'Le nom de la dépense devrait être plus descriptif',
      severity: 'warning',
    });
  }

  logger.debug('Expense validation completed', {
    expenseId: expense.id,
    valid: errors.length === 0,
    warningCount: warnings.length,
    errorCount: errors.length,
  });

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Validates that a job's expenses total matches the expenses field
 */
export function validateJobExpenseTotal(
  job: Job,
  jobExpenses: Expense[]
): ValidationResult {
  const warnings: ValidationWarning[] = [];
  const errors: ValidationWarning[] = [];

  const calculatedTotal = jobExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const difference = Math.abs(job.expenses - calculatedTotal);

  if (difference > 0.01) {
    warnings.push({
      field: 'expenses',
      message: `Le total des dépenses (${calculatedTotal.toFixed(2)}) ne correspond pas au montant enregistré (${job.expenses.toFixed(2)})`,
      severity: 'warning',
    });
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Checks for duplicate expenses (same name, amount, date)
 */
export function checkForDuplicateExpenses(
  newExpense: Expense,
  existingExpenses: Expense[]
): ValidationResult {
  const warnings: ValidationWarning[] = [];
  const errors: ValidationWarning[] = [];

  const duplicates = existingExpenses.filter(
    (exp) =>
      exp.id !== newExpense.id &&
      exp.name.toLowerCase() === newExpense.name.toLowerCase() &&
      Math.abs(exp.amount - newExpense.amount) < 0.01 &&
      exp.date === newExpense.date
  );

  if (duplicates.length > 0) {
    warnings.push({
      field: 'name',
      message: `Une dépense similaire existe déjà (${duplicates[0].name}, ${duplicates[0].amount.toFixed(2)}, ${duplicates[0].date})`,
      severity: 'warning',
    });
  }

  return {
    valid: true,
    warnings,
    errors,
  };
}

/**
 * Validates business rules across all jobs
 */
export function validateAllJobs(jobs: Job[]): ValidationResult {
  const warnings: ValidationWarning[] = [];
  const errors: ValidationWarning[] = [];

  // Rule: Total revenue should be reasonable
  const totalRevenue = jobs.reduce((sum, job) => sum + job.revenue, 0);
  if (totalRevenue === 0 && jobs.length > 0) {
    warnings.push({
      field: 'general',
      message: 'Aucun revenu enregistré. Ajoutez des montants aux contrats.',
      severity: 'warning',
    });
  }

  // Rule: Check for jobs with same name (potential duplicates)
  const jobNames = jobs.map(j => j.name.toLowerCase());
  const duplicateNames = jobNames.filter((name, index) => jobNames.indexOf(name) !== index);
  
  if (duplicateNames.length > 0) {
    warnings.push({
      field: 'general',
      message: `Contrats avec noms similaires détectés: ${[...new Set(duplicateNames)].join(', ')}`,
      severity: 'warning',
    });
  }

  // Rule: Warn about too many in-progress jobs
  const inProgressJobs = jobs.filter(j => j.status === 'En cours' as JobStatus);
  if (inProgressJobs.length > 10) {
    warnings.push({
      field: 'general',
      message: `Nombre élevé de contrats en cours (${inProgressJobs.length}). Considérez la fermeture de contrats terminés.`,
      severity: 'warning',
    });
  }

  return {
    valid: true,
    warnings,
    errors,
  };
}

/**
 * Formats validation results for display
 */
export function formatValidationResults(result: ValidationResult): string {
  const messages: string[] = [];

  if (result.errors.length > 0) {
    messages.push('Erreurs:');
    result.errors.forEach(err => {
      messages.push(`• ${err.message}`);
    });
  }

  if (result.warnings.length > 0) {
    messages.push('Avertissements:');
    result.warnings.forEach(warn => {
      messages.push(`• ${warn.message}`);
    });
  }

  return messages.join('\n');
}





