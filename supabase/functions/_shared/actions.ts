import { HttpError } from './errors.ts';
import { normalizeNullableString } from './normalise.ts';

export type SupportedAction =
  | 'create_job'
  | 'update_job'
  | 'delete_job'
  | 'update_job_status'
  | 'create_expense'
  | 'update_expense'
  | 'delete_expense'
  | 'attach_expense'
  | 'detach_expense'
  | 'create_category'
  | 'rename_category'
  | 'delete_category'
  | 'create_notification'
  | 'mark_notification_read'
  | 'delete_notification'
  | 'query';

export interface SanitizedAction {
  action: SupportedAction;
  data?: Record<string, unknown>;
  confirmationMessage?: string;
}

const SUPPORTED_ACTIONS = new Set<SupportedAction>([
  'create_job',
  'update_job',
  'delete_job',
  'update_job_status',
  'create_expense',
  'update_expense',
  'delete_expense',
  'attach_expense',
  'detach_expense',
  'create_category',
  'rename_category',
  'delete_category',
  'create_notification',
  'mark_notification_read',
  'delete_notification',
  'query',
]);

const ensureSupportedAction = (value: unknown): SupportedAction => {
  if (typeof value !== 'string') {
    throw new HttpError('Action IA invalide.', 400);
  }
  const trimmed = value.trim() as SupportedAction;
  if (!SUPPORTED_ACTIONS.has(trimmed)) {
    throw new HttpError(`Action IA "${trimmed}" non prise en charge.`, 400);
  }
  return trimmed;
};

export const sanitizeAction = (raw: unknown): SanitizedAction => {
  if (!raw || typeof raw !== 'object') {
    throw new HttpError('Action IA invalide.', 400);
  }
  const candidate = raw as Record<string, unknown>;

  const action = ensureSupportedAction(candidate.action);
  const data =
    candidate.data && typeof candidate.data === 'object'
      ? (candidate.data as Record<string, unknown>)
      : undefined;
  const confirmationMessage = normalizeNullableString(candidate.confirmationMessage) ?? undefined;

  return { action, data, confirmationMessage };
};

export const sanitizeActions = (raw: unknown): SanitizedAction[] => {
  if (!Array.isArray(raw)) {
    throw new HttpError('Le format des actions IA est invalide.', 400);
  }
  return raw.map(sanitizeAction);
};


