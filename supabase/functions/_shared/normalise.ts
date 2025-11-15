/**
 * Sanitizes a string to prevent XSS attacks
 * Removes HTML tags and dangerous characters
 */
export const sanitizeString = (value: string): string => {
  if (!value) return '';
  
  // Remove HTML tags
  let sanitized = value.replace(/<[^>]*>/g, '');
  
  // Remove script tags and their contents (extra protection)
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove event handlers (onclick, onerror, etc.)
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  
  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '');
  
  // Remove data: protocol (can be used for XSS)
  sanitized = sanitized.replace(/data:text\/html/gi, '');
  
  // Trim whitespace
  return sanitized.trim();
};

export const normalizeNullableString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const stringValue = String(value);
  const sanitized = sanitizeString(stringValue);
  const trimmed = sanitized.trim();
  return trimmed.length ? trimmed : null;
};

export const normalizeOptionalString = (value: unknown): string | undefined => {
  const normalized = normalizeNullableString(value);
  return normalized === null ? undefined : normalized;
};

export const normalizeDateInput = (value: unknown): string | null => {
  const candidate = normalizeNullableString(value);
  if (!candidate) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    const parsedIso = new Date(`${candidate}T00:00:00Z`);
    if (Number.isNaN(parsedIso.getTime())) {
      return null;
    }
    const [year, month, day] = candidate.split('-').map((segment) => Number.parseInt(segment, 10));
    if (
      parsedIso.getUTCFullYear() === year &&
      parsedIso.getUTCMonth() + 1 === month &&
      parsedIso.getUTCDate() === day
    ) {
      return candidate;
    }
    return null;
  }
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().split('T')[0];
};

export const parseCurrencyAmount = (value: unknown): number => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s]/g, '');
    const parsed = Number.parseFloat(cleaned);
    return Number.isNaN(parsed) ? Number.NaN : parsed;
  }
  return Number.NaN;
};

export const ensurePositiveAmount = (value: unknown, errorMessage: string): number => {
  const amount = parseCurrencyAmount(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(errorMessage);
  }
  return amount;
};

