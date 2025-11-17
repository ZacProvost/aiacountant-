import type { AIResponse } from '../types';
import { supabase } from './supabaseClient';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;
const MAX_HISTORY_MESSAGES = 60; // ENHANCED: Increased to 60 for excellent short-term memory and context tracking
// This matches the history limit in ai-proxy to ensure consistent context across the system

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Normalize conversation history while preserving excellent context
 * Keeps last 60 messages for superior context retention and entity tracking
 * This allows the AI to remember "that contract" and recent discussions
 */
const normaliseHistory = (history: Array<{ role: 'user' | 'assistant'; content: string }>) =>
  history
    .filter((message) => message.content && typeof message.content === 'string')
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-MAX_HISTORY_MESSAGES);

export const aiService = {
  sendMessage: async (
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    context: Record<string, unknown> = {},
    retryCount: number = 0
  ): Promise<AIResponse> => {
    const trimmedPrompt = userMessage.trim();
    if (!trimmedPrompt.length) {
      throw new Error('Le message est vide.');
    }

    try {
      const { data, error } = await supabase.functions.invoke<AIResponse>('ai-proxy', {
        body: {
          prompt: trimmedPrompt,
          history: normaliseHistory(conversationHistory),
          context,
        },
      });

      if (error) {
        const detail = (error as { details?: string }).details;
        const composedMessage = detail
          ? `${error.message ?? 'Le proxy IA a renvoyé une erreur.'} (${detail})`
          : error.message ?? 'Le proxy IA a renvoyé une erreur.';
        if (retryCount < MAX_RETRIES && /(network|fetch)/i.test(error.message ?? '')) {
          await delay(RETRY_DELAY_MS * (retryCount + 1));
          return aiService.sendMessage(userMessage, conversationHistory, context, retryCount + 1);
        }
        throw new Error(composedMessage);
      }

      if (!data) {
        throw new Error('Réponse vide du proxy IA.');
      }

      return data;
    } catch (caught) {
      if (caught instanceof Error) {
        throw caught;
      }
      throw new Error('Erreur inconnue du proxy IA.');
    }
  },

  /**
   * Update conversation memory summary
   * Should be called periodically (e.g., every 5-10 messages) to maintain context
   */
  updateConversationMemory: async (
    conversationId: string,
    forceUpdate: boolean = false
  ): Promise<{ success: boolean; memorySummary?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke<{
        conversationId: string;
        memorySummary: string;
        messageCount: number;
        updated: boolean;
      }>('conversation-memory', {
        body: {
          conversationId,
          forceUpdate,
        },
      });

      if (error) {
        console.error('Failed to update conversation memory:', error);
        return { success: false };
      }

      if (!data) {
        return { success: false };
      }

      return {
        success: true,
        memorySummary: data.memorySummary,
      };
    } catch (error) {
      console.error('Error updating conversation memory:', error);
      return { success: false };
    }
  },
};

