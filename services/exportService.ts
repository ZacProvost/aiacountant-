/**
 * Data export service for jobs and expenses
 * Supports CSV export for use in accounting software or spreadsheets
 */

import type { Job, Expense } from '../types';
import { logger } from './logging';

/**
 * Escapes a CSV field value
 */
function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);

  // If the value contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Converts an array of objects to CSV format
 */
function arrayToCSV<T extends Record<string, unknown>>(
  data: T[],
  headers: Array<{ key: keyof T; label: string }>
): string {
  if (data.length === 0) {
    return '';
  }

  // Header row
  const headerRow = headers.map(h => escapeCSV(h.label)).join(',');

  // Data rows
  const dataRows = data.map(row =>
    headers.map(h => escapeCSV(row[h.key])).join(',')
  );

  return [headerRow, ...dataRows].join('\n');
}

/**
 * Downloads a string as a file
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Formats a number as currency
 */
function formatCurrency(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Formats a date for export
 */
function formatDate(date: string): string {
  if (!date) return '';
  
  try {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  } catch {
    return date;
  }
}

export const exportService = {
  /**
   * Exports jobs to CSV format
   */
  exportJobsToCSV(jobs: Job[]): void {
    try {
      logger.info('Exporting jobs to CSV', { count: jobs.length });

      const headers = [
        { key: 'name' as keyof Job, label: 'Nom du contrat' },
        { key: 'clientName' as keyof Job, label: 'Client' },
        { key: 'address' as keyof Job, label: 'Adresse' },
        { key: 'status' as keyof Job, label: 'Statut' },
        { key: 'revenue' as keyof Job, label: 'Revenu' },
        { key: 'expenses' as keyof Job, label: 'Dépenses' },
        { key: 'profit' as keyof Job, label: 'Profit' },
        { key: 'startDate' as keyof Job, label: 'Date de début' },
        { key: 'endDate' as keyof Job, label: 'Date de fin' },
        { key: 'description' as keyof Job, label: 'Description' },
      ];

      // Format data for export
      const formattedJobs = jobs.map(job => ({
        name: job.name,
        clientName: job.clientName || '',
        address: job.address || '',
        status: job.status,
        revenue: formatCurrency(job.revenue),
        expenses: formatCurrency(job.expenses),
        profit: formatCurrency(job.profit),
        startDate: formatDate(job.startDate),
        endDate: formatDate(job.endDate),
        description: job.description || '',
      }));

      const csv = arrayToCSV(formattedJobs, headers);
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `contrats_${timestamp}.csv`;

      downloadFile(csv, filename, 'text/csv;charset=utf-8;');

      logger.info('Jobs exported successfully', { filename, count: jobs.length });
    } catch (error) {
      logger.error('Failed to export jobs', {}, error);
      throw new Error('Échec de l\'exportation des contrats');
    }
  },

  /**
   * Exports expenses to CSV format
   */
  exportExpensesToCSV(expenses: Expense[]): void {
    try {
      logger.info('Exporting expenses to CSV', { count: expenses.length });

      const headers = [
        { key: 'name' as keyof Expense, label: 'Nom de la dépense' },
        { key: 'amount' as keyof Expense, label: 'Montant' },
        { key: 'category' as keyof Expense, label: 'Catégorie' },
        { key: 'date' as keyof Expense, label: 'Date' },
        { key: 'jobId' as keyof Expense, label: 'Contrat associé' },
        { key: 'vendor' as keyof Expense, label: 'Fournisseur' },
        { key: 'notes' as keyof Expense, label: 'Notes' },
      ];

      // Format data for export
      const formattedExpenses = expenses.map(expense => ({
        name: expense.name,
        amount: formatCurrency(expense.amount),
        category: expense.category,
        date: formatDate(expense.date),
        jobId: expense.jobId || '',
        vendor: expense.vendor || '',
        notes: expense.notes || '',
      }));

      const csv = arrayToCSV(formattedExpenses, headers);
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `depenses_${timestamp}.csv`;

      downloadFile(csv, filename, 'text/csv;charset=utf-8;');

      logger.info('Expenses exported successfully', { filename, count: expenses.length });
    } catch (error) {
      logger.error('Failed to export expenses', {}, error);
      throw new Error('Échec de l\'exportation des dépenses');
    }
  },

  /**
   * Exports both jobs and expenses to a combined CSV
   */
  exportAllDataToCSV(jobs: Job[], expenses: Expense[]): void {
    try {
      logger.info('Exporting all data to CSV', {
        jobCount: jobs.length,
        expenseCount: expenses.length,
      });

      // Export jobs
      const jobsHeaders = [
        { key: 'name' as keyof Job, label: 'Nom du contrat' },
        { key: 'clientName' as keyof Job, label: 'Client' },
        { key: 'status' as keyof Job, label: 'Statut' },
        { key: 'revenue' as keyof Job, label: 'Revenu' },
        { key: 'expenses' as keyof Job, label: 'Dépenses' },
        { key: 'profit' as keyof Job, label: 'Profit' },
        { key: 'startDate' as keyof Job, label: 'Date de début' },
        { key: 'endDate' as keyof Job, label: 'Date de fin' },
      ];

      const formattedJobs = jobs.map(job => ({
        name: job.name,
        clientName: job.clientName || '',
        status: job.status,
        revenue: formatCurrency(job.revenue),
        expenses: formatCurrency(job.expenses),
        profit: formatCurrency(job.profit),
        startDate: formatDate(job.startDate),
        endDate: formatDate(job.endDate),
      }));

      const jobsCSV = arrayToCSV(formattedJobs, jobsHeaders);

      // Export expenses
      const expensesHeaders = [
        { key: 'name' as keyof Expense, label: 'Nom de la dépense' },
        { key: 'amount' as keyof Expense, label: 'Montant' },
        { key: 'category' as keyof Expense, label: 'Catégorie' },
        { key: 'date' as keyof Expense, label: 'Date' },
        { key: 'jobId' as keyof Expense, label: 'Contrat associé' },
        { key: 'vendor' as keyof Expense, label: 'Fournisseur' },
      ];

      const formattedExpenses = expenses.map(expense => ({
        name: expense.name,
        amount: formatCurrency(expense.amount),
        category: expense.category,
        date: formatDate(expense.date),
        jobId: expense.jobId || '',
        vendor: expense.vendor || '',
      }));

      const expensesCSV = arrayToCSV(formattedExpenses, expensesHeaders);

      // Combine both sections
      const combined = `CONTRATS\n${jobsCSV}\n\n\nDÉPENSES\n${expensesCSV}`;

      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `fiscalia_export_${timestamp}.csv`;

      downloadFile(combined, filename, 'text/csv;charset=utf-8;');

      logger.info('All data exported successfully', { filename });
    } catch (error) {
      logger.error('Failed to export all data', {}, error);
      throw new Error('Échec de l\'exportation des données');
    }
  },

  /**
   * Exports a summary report as CSV
   */
  exportSummaryReport(jobs: Job[], expenses: Expense[]): void {
    try {
      logger.info('Exporting summary report');

      const totalRevenue = jobs.reduce((sum, job) => sum + job.revenue, 0);
      const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
      const totalProfit = totalRevenue - totalExpenses;

      const summaryData = [
        { metric: 'Total des revenus', value: formatCurrency(totalRevenue) },
        { metric: 'Total des dépenses', value: formatCurrency(totalExpenses) },
        { metric: 'Profit total', value: formatCurrency(totalProfit) },
        { metric: 'Nombre de contrats', value: String(jobs.length) },
        { metric: 'Nombre de dépenses', value: String(expenses.length) },
        { metric: 'Revenu moyen par contrat', value: formatCurrency(jobs.length > 0 ? totalRevenue / jobs.length : 0) },
        { metric: 'Dépense moyenne', value: formatCurrency(expenses.length > 0 ? totalExpenses / expenses.length : 0) },
      ];

      const headers = [
        { key: 'metric' as const, label: 'Métrique' },
        { key: 'value' as const, label: 'Valeur' },
      ];

      const csv = arrayToCSV(summaryData, headers);
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `resume_financier_${timestamp}.csv`;

      downloadFile(csv, filename, 'text/csv;charset=utf-8;');

      logger.info('Summary report exported successfully', { filename });
    } catch (error) {
      logger.error('Failed to export summary report', {}, error);
      throw new Error('Échec de l\'exportation du résumé');
    }
  },

  /**
   * Exports data as JSON (for backup purposes)
   */
  exportAsJSON(jobs: Job[], expenses: Expense[], categories: string[]): void {
    try {
      logger.info('Exporting as JSON');

      const data = {
        exportDate: new Date().toISOString(),
        version: '1.0',
        jobs,
        expenses,
        categories,
      };

      const json = JSON.stringify(data, null, 2);
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `fiscalia_backup_${timestamp}.json`;

      downloadFile(json, filename, 'application/json');

      logger.info('JSON export successful', { filename });
    } catch (error) {
      logger.error('Failed to export as JSON', {}, error);
      throw new Error('Échec de l\'exportation JSON');
    }
  },
};





