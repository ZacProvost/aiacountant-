import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';
import { createLogger } from './logger.ts';
import { getEnvVar } from './env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';

export interface MetricRecord {
  correlationId: string;
  functionName: string;
  durationMs: number;
  success: boolean;
  userId?: string | null;
  actionCount?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
}

// Create a Supabase client for metrics (uses service role for direct access)
const getMetricsClient = (): SupabaseClient => {
  try {
    const supabaseUrl = getEnvVar('SUPABASE_URL');
    const serviceKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');
    return createClient(supabaseUrl, serviceKey);
  } catch {
    // If env vars aren't available, return a dummy client that will fail gracefully
    return createClient('', '');
  }
};

export const recordMetric = async (metric: MetricRecord): Promise<void> => {
  const supabase = getMetricsClient();
  const logger = createLogger({ scope: 'metrics.record', correlationId: metric.correlationId });
  try {
    const { error } = await supabase
      .from('ai_metrics')
      .insert({
        correlation_id: metric.correlationId,
        function_name: metric.functionName,
        duration_ms: metric.durationMs,
        success: metric.success,
        user_id: metric.userId ?? null,
        action_count: metric.actionCount ?? null,
        error_code: metric.errorCode ?? null,
        error_message: metric.errorMessage ?? null,
      });

    if (error) {
      logger.warn('Failed to persist metrics', { error: error.message });
    }
  } catch (error) {
    logger.warn('Failed to persist metrics', { error: String(error) });
  }
};

