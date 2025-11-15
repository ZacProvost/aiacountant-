/**
 * Centralized error handling and standardization
 * All errors should be translated to French and user-friendly
 */

export enum ErrorCode {
  // Validation errors (1000-1999)
  VALIDATION_ERROR = 'ERR_1000',
  INVALID_AMOUNT = 'ERR_1001',
  INVALID_DATE = 'ERR_1002',
  INVALID_ID = 'ERR_1003',
  MISSING_REQUIRED_FIELD = 'ERR_1004',
  
  // Authentication errors (2000-2999)
  UNAUTHORIZED = 'ERR_2000',
  SESSION_EXPIRED = 'ERR_2001',
  INVALID_CREDENTIALS = 'ERR_2002',
  
  // Database errors (3000-3999)
  DATABASE_ERROR = 'ERR_3000',
  NOT_FOUND = 'ERR_3001',
  DUPLICATE_ENTRY = 'ERR_3002',
  FOREIGN_KEY_VIOLATION = 'ERR_3003',
  
  // Network errors (4000-4999)
  NETWORK_ERROR = 'ERR_4000',
  TIMEOUT = 'ERR_4001',
  SERVICE_UNAVAILABLE = 'ERR_4002',
  
  // AI errors (5000-5999)
  AI_ERROR = 'ERR_5000',
  AI_RESPONSE_INVALID = 'ERR_5001',
  AI_RATE_LIMIT = 'ERR_5002',
  
  // Business logic errors (6000-6999)
  BUSINESS_RULE_VIOLATION = 'ERR_6000',
  INSUFFICIENT_PERMISSIONS = 'ERR_6001',
  INVALID_OPERATION = 'ERR_6002',
  
  // General errors
  UNKNOWN_ERROR = 'ERR_9999',
}

export interface AppError {
  code: ErrorCode;
  message: string;
  detail?: string;
  field?: string;
  originalError?: Error;
}

/**
 * Creates a standardized error object
 */
export function createError(
  code: ErrorCode,
  message: string,
  options: {
    detail?: string;
    field?: string;
    originalError?: Error;
  } = {}
): AppError {
  return {
    code,
    message,
    detail: options.detail,
    field: options.field,
    originalError: options.originalError,
  };
}

/**
 * Translates common error messages to French
 */
export function translateError(error: unknown): AppError {
  // If it's already an AppError, return it
  if (isAppError(error)) {
    return error;
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Database errors
    if (message.includes('unique constraint') || message.includes('duplicate')) {
      return createError(
        ErrorCode.DUPLICATE_ENTRY,
        'Cet élément existe déjà.',
        { detail: 'Un élément avec ces informations existe déjà dans la base de données.', originalError: error }
      );
    }

    if (message.includes('foreign key') || message.includes('violates')) {
      return createError(
        ErrorCode.FOREIGN_KEY_VIOLATION,
        'Impossible de supprimer cet élément car il est utilisé ailleurs.',
        { detail: 'Cet élément est référencé par d\'autres données.', originalError: error }
      );
    }

    if (message.includes('not found') || message.includes('introuvable')) {
      return createError(
        ErrorCode.NOT_FOUND,
        'Élément introuvable.',
        { detail: 'L\'élément demandé n\'existe pas ou a été supprimé.', originalError: error }
      );
    }

    // Authentication errors
    if (message.includes('unauthorized') || message.includes('non autorisé')) {
      return createError(
        ErrorCode.UNAUTHORIZED,
        'Accès non autorisé.',
        { detail: 'Vous devez être connecté pour effectuer cette action.', originalError: error }
      );
    }

    if (message.includes('invalid credentials') || message.includes('invalid password')) {
      return createError(
        ErrorCode.INVALID_CREDENTIALS,
        'Identifiants invalides.',
        { detail: 'L\'adresse courriel ou le mot de passe est incorrect.', originalError: error }
      );
    }

    if (message.includes('session') && message.includes('expired')) {
      return createError(
        ErrorCode.SESSION_EXPIRED,
        'Session expirée.',
        { detail: 'Votre session a expiré. Veuillez vous reconnecter.', originalError: error }
      );
    }

    // Network errors
    if (message.includes('network') || message.includes('fetch') || message.includes('econnrefused')) {
      return createError(
        ErrorCode.NETWORK_ERROR,
        'Erreur de connexion.',
        { detail: 'Impossible de se connecter au serveur. Vérifiez votre connexion internet.', originalError: error }
      );
    }

    if (message.includes('timeout') || message.includes('timed out')) {
      return createError(
        ErrorCode.TIMEOUT,
        'Délai d\'attente dépassé.',
        { detail: 'La requête a pris trop de temps. Veuillez réessayer.', originalError: error }
      );
    }

    if (message.includes('503') || message.includes('service unavailable')) {
      return createError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Service temporairement indisponible.',
        { detail: 'Le service est en maintenance ou surchargé. Veuillez réessayer dans quelques instants.', originalError: error }
      );
    }

    // AI errors
    if (message.includes('ai') || message.includes('model') || message.includes('openrouter')) {
      return createError(
        ErrorCode.AI_ERROR,
        'Erreur du service IA.',
        { detail: 'Le service d\'intelligence artificielle a rencontré une erreur.', originalError: error }
      );
    }

    if (message.includes('rate limit')) {
      return createError(
        ErrorCode.AI_RATE_LIMIT,
        'Limite d\'utilisation atteinte.',
        { detail: 'Vous avez atteint la limite d\'utilisation. Veuillez réessayer plus tard.', originalError: error }
      );
    }

    // Validation errors
    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
      return createError(
        ErrorCode.VALIDATION_ERROR,
        'Données invalides.',
        { detail: error.message, originalError: error }
      );
    }

    // Database errors (generic)
    if (message.includes('database') || message.includes('postgres') || message.includes('sql')) {
      return createError(
        ErrorCode.DATABASE_ERROR,
        'Erreur de base de données.',
        { detail: 'Une erreur s\'est produite lors de l\'accès aux données.', originalError: error }
      );
    }

    // Default: preserve the error message but mark it as unknown
    return createError(
      ErrorCode.UNKNOWN_ERROR,
      'Une erreur inattendue s\'est produite.',
      { detail: error.message, originalError: error }
    );
  }

  // Handle string errors
  if (typeof error === 'string') {
    return createError(
      ErrorCode.UNKNOWN_ERROR,
      error || 'Une erreur inattendue s\'est produite.',
      { detail: error }
    );
  }

  // Handle unknown error types
  return createError(
    ErrorCode.UNKNOWN_ERROR,
    'Une erreur inattendue s\'est produite.',
    { detail: String(error) }
  );
}

/**
 * Type guard to check if an object is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  );
}

/**
 * Formats an error for display to the user
 */
export function formatErrorForUser(error: unknown): string {
  const appError = translateError(error);
  
  // For user display, show the main message
  // Detail is available for logging or expanded error views
  return appError.message;
}

/**
 * Formats an error for logging (includes more details)
 */
export function formatErrorForLog(error: unknown): {
  code: string;
  message: string;
  detail?: string;
  field?: string;
  stack?: string;
} {
  const appError = translateError(error);
  
  return {
    code: appError.code,
    message: appError.message,
    detail: appError.detail,
    field: appError.field,
    stack: appError.originalError?.stack,
  };
}

/**
 * Checks if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  const appError = translateError(error);
  
  const retryableCodes = [
    ErrorCode.NETWORK_ERROR,
    ErrorCode.TIMEOUT,
    ErrorCode.SERVICE_UNAVAILABLE,
    ErrorCode.DATABASE_ERROR, // Some database errors are transient
  ];
  
  return retryableCodes.includes(appError.code);
}

/**
 * Gets a user-friendly suggestion for fixing an error
 */
export function getErrorSuggestion(error: unknown): string | null {
  const appError = translateError(error);
  
  const suggestions: Partial<Record<ErrorCode, string>> = {
    [ErrorCode.NETWORK_ERROR]: 'Vérifiez votre connexion internet et réessayez.',
    [ErrorCode.TIMEOUT]: 'Réessayez dans quelques instants.',
    [ErrorCode.SESSION_EXPIRED]: 'Reconnectez-vous pour continuer.',
    [ErrorCode.UNAUTHORIZED]: 'Assurez-vous d\'être connecté.',
    [ErrorCode.NOT_FOUND]: 'L\'élément a peut-être été supprimé. Actualisez la page.',
    [ErrorCode.AI_RATE_LIMIT]: 'Attendez quelques minutes avant de réessayer.',
    [ErrorCode.SERVICE_UNAVAILABLE]: 'Réessayez dans quelques minutes.',
    [ErrorCode.DUPLICATE_ENTRY]: 'Vérifiez que vous n\'avez pas déjà créé cet élément.',
  };
  
  return suggestions[appError.code] || null;
}


