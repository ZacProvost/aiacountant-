import type { AIAction, ActionExecutionLogEntry, ActionExecutionResult } from '../types';
import { supabase } from './supabaseClient';

const FUNCTION_NAME = 'ai-actions';

type ExecuteResponse = {
  success: boolean;
  mutated?: boolean;
  log?: ActionExecutionLogEntry[];
  error?: string;
};

export class ActionExecutionError extends Error {
  public readonly log: ActionExecutionLogEntry[];
  public readonly mutatedBeforeFailure: boolean;

  constructor(message: string, log: ActionExecutionLogEntry[], mutatedBeforeFailure: boolean) {
    super(message);
    this.name = 'ActionExecutionError';
    this.log = log;
    this.mutatedBeforeFailure = mutatedBeforeFailure;
  }
}

export const actionService = {
  async execute(actions: AIAction[]): Promise<ActionExecutionResult> {
    const { data, error } = await supabase.functions.invoke<ExecuteResponse>(FUNCTION_NAME, {
      body: { actions },
    });

    if (error) {
      const message = error.message ?? 'Le serveur a rejeté les actions IA.';
      throw new ActionExecutionError(message, [], false);
    }

    if (!data) {
      throw new ActionExecutionError('Réponse vide du serveur IA.', [], false);
    }

    if (!data.success) {
      throw new ActionExecutionError(
        data.error ?? 'Une action IA a échoué.',
        Array.isArray(data.log) ? data.log : [],
        Boolean(data.mutated)
      );
    }

    return {
      mutated: Boolean(data.mutated),
      log: Array.isArray(data.log) ? data.log : [],
    };
  },
};

