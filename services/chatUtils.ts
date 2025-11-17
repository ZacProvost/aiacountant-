export type MessageIdPrefix = 'user' | 'ai';

export const createMessageId = (prefix: MessageIdPrefix): string => {
  const uniquePart =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uniquePart}`;
};





