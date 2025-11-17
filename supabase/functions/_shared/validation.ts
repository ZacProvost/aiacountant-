/**
 * Validation utilities for AI responses and data quality
 */

export interface AIResponseSchema {
  text: string;
  actions?: Array<{
    action: string;
    data?: Record<string, unknown>;
    confirmationMessage?: string;
  }>;
}

/**
 * Validates that a string is proper French text without technical artifacts
 */
export function isProperFrenchText(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const trimmed = text.trim();
  
  // Must have minimum length
  if (trimmed.length < 3) {
    return false;
  }

  // Should not contain JSON-like structures
  if (trimmed.includes('{') || trimmed.includes('[')) {
    return false;
  }

  // Should not contain code markers
  if (trimmed.includes('```') || trimmed.includes('`')) {
    return false;
  }

  // Should not start/end with quotes that suggest it's a string literal
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || 
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return false;
  }

  // Should not contain action keywords (these belong in actions array)
  const actionKeywords = ['action:', '"action"', 'data:', '"data"'];
  if (actionKeywords.some(keyword => trimmed.includes(keyword))) {
    return false;
  }

  return true;
}

/**
 * Scores the quality of an AI response (0-100)
 * Higher scores indicate better quality
 */
export function scoreAIResponse(response: AIResponseSchema): number {
  let score = 100;

  // Validate text quality
  if (!response.text || response.text.length < 10) {
    score -= 50;
  } else if (response.text.length < 20) {
    score -= 30;
  }

  // Penalize for JSON/code artifacts in text
  if (response.text.includes('{') || response.text.includes('[') || response.text.includes('```')) {
    score -= 40;
  }

  // Check for proper French punctuation
  const frenchPunctuationPattern = /[.!?]$/;
  if (!frenchPunctuationPattern.test(response.text.trim())) {
    score -= 15;
  }

  // Penalize for English technical terms that shouldn't be user-facing
  const technicalTerms = ['error', 'failed', 'exception', 'null', 'undefined', 'database'];
  if (technicalTerms.some(term => response.text.toLowerCase().includes(term))) {
    score -= 20;
  }

  // Reward proper French
  const frenchIndicators = ['je', 'vous', 'nous', 'est', 'sont', 'le', 'la', 'les', 'à'];
  const frenchCount = frenchIndicators.filter(word => 
    response.text.toLowerCase().includes(` ${word} `)
  ).length;
  score += Math.min(frenchCount * 3, 20);

  // Validate actions if present
  if (response.actions && Array.isArray(response.actions)) {
    response.actions.forEach((action) => {
      if (!action.action || typeof action.action !== 'string') {
        score -= 15;
      }
    });
  }

  // Ensure score stays in valid range
  return Math.max(0, Math.min(100, score));
}

/**
 * Validates an AI response meets minimum quality standards
 * Returns true if response is acceptable, false if it should be rejected/retried
 */
export function validateAIResponse(
  response: AIResponseSchema,
  options: {
    minScore?: number;
    maxTextLength?: number;
    requireFrench?: boolean;
  } = {}
): { valid: boolean; score: number; errors: string[] } {
  const {
    minScore = 60,
    maxTextLength = 1000,
    requireFrench = true
  } = options;

  const errors: string[] = [];
  const score = scoreAIResponse(response);

  // Check minimum score
  if (score < minScore) {
    errors.push(`Response quality score (${score}) below minimum (${minScore})`);
  }

  // Check text is proper French
  if (requireFrench && !isProperFrenchText(response.text)) {
    errors.push('Response text contains technical artifacts or is not proper French');
  }

  // Check text length
  if (response.text.length > maxTextLength) {
    errors.push(`Response text too long (${response.text.length} > ${maxTextLength})`);
  }

  // Validate actions structure
  if (response.actions) {
    if (!Array.isArray(response.actions)) {
      errors.push('Actions must be an array');
    } else {
      response.actions.forEach((action, index) => {
        if (!action.action) {
          errors.push(`Action ${index} missing required 'action' field`);
        }
        if (action.data && typeof action.data !== 'object') {
          errors.push(`Action ${index} data must be an object`);
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    score,
    errors
  };
}

/**
 * Generates a user-friendly fallback response when AI fails
 */
export function generateFallbackResponse(
  context: 'general' | 'financial' | 'creation' | 'deletion' | 'query'
): string {
  const fallbacks: Record<string, string> = {
    general: "Je suis désolé, je n'ai pas pu traiter votre demande correctement. Pouvez-vous la reformuler?",
    financial: "Je rencontre des difficultés techniques pour traiter cette opération financière. Veuillez réessayer.",
    creation: "Je n'ai pas pu créer cet élément pour le moment. Veuillez vérifier les informations et réessayer.",
    deletion: "Je n'ai pas pu supprimer cet élément. Veuillez réessayer.",
    query: "Je n'ai pas pu obtenir les informations demandées. Veuillez reformuler votre question."
  };

  return fallbacks[context] || fallbacks.general;
}

/**
 * Cleans and sanitizes AI-generated text
 */
export function sanitizeAIText(text: string): string {
  let cleaned = text.trim();

  // Remove markdown code blocks
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/`[^`]+`/g, '');

  // Remove JSON-like structures
  cleaned = cleaned.replace(/\{[\s\S]*?\}/g, '');
  cleaned = cleaned.replace(/\[[\s\S]*?\]/g, '');

  // Remove excess whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Ensure ends with proper punctuation
  if (cleaned && !/[.!?]$/.test(cleaned)) {
    cleaned += '.';
  }

  return cleaned;
}

/**
 * Extracts and validates a float/currency amount from various input formats
 */
export function parseAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    // Remove currency symbols and spaces
    const cleaned = value.replace(/[$€£¥\s,]/g, '').trim();
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/**
 * Validates a date string is in proper format and valid
 */
export function isValidDate(dateString: unknown): boolean {
  if (typeof dateString !== 'string') {
    return false;
  }

  // Check format YYYY-MM-DD
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDatePattern.test(dateString)) {
    return false;
  }

  // Verify it's a valid date
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}





