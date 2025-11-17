import { supabase } from './supabaseClient';
import type { Expense, ExpenseCategory, Job, Notification, UserProfile, ChatMessage, Conversation } from '../types';

export interface LoadDataResult {
  jobs: Job[];
  expenses: Expense[];
  categories: ExpenseCategory[];
  notifications: Notification[];
  conversations: Conversation[];
  messagesByConversation: Record<string, ChatMessage[]>;
  profile: UserProfile | null;
}

export const mapJobFromDb = (record: any): Job => ({
  id: record.id,
  name: record.name,
  clientName: record.client_name ?? undefined,
  address: record.address ?? undefined,
  description: record.description ?? undefined,
  status: record.status,
  revenue: Number(record.revenue ?? 0),
  expenses: Number(record.expenses ?? 0),
  profit: Number(record.profit ?? 0),
  startDate: record.start_date ?? '',
  endDate: record.end_date ?? '',
});

export const mapExpenseFromDb = (record: any): Expense => ({
  id: record.id,
  name: record.name,
  amount: Number(record.amount ?? 0),
  category: record.category,
  date: record.date,
  jobId: record.job_id ?? undefined,
  // Store receipt_path as-is - the ExpenseDetailModal will generate a signed URL for private buckets
  // Format: receipt_path is like "userId/filename.jpg" which can be used directly with createSignedUrl
  receiptImage: record.receipt_path ?? undefined,
  vendor: record.vendor ?? undefined,
  notes: record.notes ?? undefined,
});

export const mapNotificationFromDb = (record: any): Notification => ({
  id: record.id,
  message: record.message,
  type: record.type,
  timestamp: record.timestamp,
  read: record.read,
  jobId: record.job_id ?? undefined,
});

export const mapMessageFromDb = (record: any): ChatMessage => {
  // Note: receiptImage is not set here because the receipts bucket is private
  // UserMessageBubble will generate signed URLs from receiptPath when needed
  // This ensures proper authentication and security for private buckets
  // The component handles this efficiently with proper loading states
  
  return {
    id: record.id,
    conversationId: record.conversation_id,
    sender: record.sender,
    text: record.text,
    timestamp: record.timestamp,
    customTitle: record.custom_title ?? undefined,
    jobSummary: record.job_summary ?? undefined,
    receiptPath: record.receipt_path ?? undefined,
    // receiptImage is undefined - UserMessageBubble will generate signed URL
    // This is correct for private buckets with RLS
    receiptImage: undefined,
    receiptOcrData: record.receipt_ocr ?? undefined,
  };
};

export const mapConversationFromDb = (record: any): Conversation => ({
  id: record.id,
  title: record.title ?? 'Nouvelle conversation',
  createdAt: record.created_at ?? new Date().toISOString(),
  updatedAt: record.updated_at ?? new Date().toISOString(),
  hasUserMessage: Boolean(record.has_user_message),
  lastMessagePreview: record.last_message_preview ?? undefined,
  lastMessageAt: record.last_message_at ?? undefined,
  memorySummary: record.memory_summary ?? undefined,
});

const coalesceConversationId = () =>
  `conv-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 11)}`;

export const dataService = {
  async loadData(userId: string): Promise<LoadDataResult> {
    const [jobsRes, expensesRes, categoriesRes, notificationsRes, messagesRes, conversationsRes, profileRes] = await Promise.all([
      supabase.from('jobs').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('expenses').select('*').eq('user_id', userId).order('date', { ascending: false }),
      supabase.from('categories').select('name').eq('user_id', userId).order('name', { ascending: true }),
      supabase.from('notifications').select('*').eq('user_id', userId).order('timestamp', { ascending: false }),
      supabase.from('messages').select('*').eq('user_id', userId).order('timestamp', { ascending: true }),
      supabase.from('conversations').select('*').eq('user_id', userId).order('last_message_at', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    ]);

    const loadError =
      jobsRes.error ||
      expensesRes.error ||
      categoriesRes.error ||
      notificationsRes.error ||
      messagesRes.error ||
      conversationsRes.error ||
      profileRes.error;

    if (loadError) {
      throw loadError;
    }

    let conversations = (conversationsRes.data ?? []).map(mapConversationFromDb);
    const rawMessages = messagesRes.data ?? [];

    const messagesWithoutConversation = rawMessages.filter((record) => !record.conversation_id);

    if (messagesWithoutConversation.length) {
      // Assign orphan messages to the most recent conversation (first item after ordering)
      const fallbackConversationId = conversations[0]?.id ?? coalesceConversationId();

      if (!conversations.find((c) => c.id === fallbackConversationId)) {
        const { data: fallbackConversation, error: fallbackError } = await supabase
          .from('conversations')
          .insert({
            id: fallbackConversationId,
            user_id: userId,
          })
          .select()
          .single();

        if (fallbackError) {
          throw fallbackError;
        }

        conversations.unshift(mapConversationFromDb(fallbackConversation));
      }

      const orphanIds = messagesWithoutConversation.map((record) => record.id);
      if (orphanIds.length) {
        const { error: updateError } = await supabase
          .from('messages')
          .update({ conversation_id: fallbackConversationId })
          .in('id', orphanIds);

        if (updateError) {
          throw updateError;
        }

        messagesWithoutConversation.forEach((record) => {
          // eslint-disable-next-line no-param-reassign
          record.conversation_id = fallbackConversationId;
        });
      }
    }

    const messagesByConversation: Record<string, ChatMessage[]> = {};
    rawMessages
      .map(mapMessageFromDb)
      .forEach((message) => {
        if (!message.conversationId) {
          return;
        }
        if (!messagesByConversation[message.conversationId]) {
          messagesByConversation[message.conversationId] = [];
        }
        messagesByConversation[message.conversationId].push(message);
      });

    // Recalculate conversation metadata locally (used by UI)
    const conversationMeta = new Map<string, { hasUserMessage: boolean; lastMessagePreview?: string; lastMessageAt?: string }>();
    Object.entries(messagesByConversation).forEach(([conversationId, convoMessages]) => {
      if (!convoMessages.length) {
        conversationMeta.set(conversationId, {
          hasUserMessage: false,
          lastMessagePreview: undefined,
          lastMessageAt: undefined,
        });
        return;
      }
      const sorted = [...convoMessages].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const hasUserMessage = sorted.some((msg) => msg.sender === 'user');
      const latest = sorted[sorted.length - 1];
      const latestUserMessage = [...sorted].reverse().find((msg) => msg.sender === 'user');
      conversationMeta.set(conversationId, {
        hasUserMessage,
        lastMessagePreview: latestUserMessage?.text,
        lastMessageAt: latest.timestamp,
      });
    });

    conversations = conversations.map((conversation) => {
      const metadata = conversationMeta.get(conversation.id);
      if (!metadata) return conversation;
      return {
        ...conversation,
        hasUserMessage: metadata.hasUserMessage,
        lastMessagePreview: metadata.lastMessagePreview,
        lastMessageAt: metadata.lastMessageAt,
      };
    });

    return {
      jobs: (jobsRes.data ?? []).map(mapJobFromDb),
      expenses: (expensesRes.data ?? []).map(mapExpenseFromDb),
      categories: (categoriesRes.data ?? []).map((c) => c.name as ExpenseCategory),
      notifications: (notificationsRes.data ?? []).map(mapNotificationFromDb),
      conversations,
      messagesByConversation,
      profile: profileRes.data
        ? {
            name: profileRes.data.name ?? '',
            email: profileRes.data.email ?? undefined,
            companyName: profileRes.data.company_name ?? undefined,
            taxRate: profileRes.data.tax_rate ?? undefined,
          }
        : null,
    };
  },

  async loadConversationMessages(userId: string, conversationId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map(mapMessageFromDb);
  },

  async createConversation(userId: string, title: string = 'Nouvelle conversation'): Promise<Conversation> {
    const newId = coalesceConversationId();
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        id: newId,
        user_id: userId,
        title,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return mapConversationFromDb(data);
  },

  async renameConversation(userId: string, conversationId: string, title: string): Promise<void> {
    const { error } = await supabase
      .from('conversations')
      .update({ title })
      .eq('id', conversationId)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }
  },

  async updateConversationState(
    userId: string,
    conversationId: string,
    updates: Partial<Pick<Conversation, 'hasUserMessage' | 'lastMessagePreview' | 'lastMessageAt' | 'title' | 'memorySummary'>>
  ): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(updates, 'hasUserMessage')) {
      payload.has_user_message = updates.hasUserMessage;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'lastMessagePreview')) {
      payload.last_message_preview = updates.lastMessagePreview ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'lastMessageAt')) {
      payload.last_message_at = updates.lastMessageAt ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'title')) {
      payload.title = updates.title;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'memorySummary')) {
      payload.memory_summary = updates.memorySummary ?? null;
    }
    if (!Object.keys(payload).length) {
      return;
    }

    const { error } = await supabase
      .from('conversations')
      .update(payload)
      .eq('id', conversationId)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }
  },

  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }
  },

  async upsertProfile(userId: string, profile: Partial<UserProfile>) {
    const { error } = await supabase.from('profiles').upsert(
      {
        id: userId,
        name: profile.name ?? null,
        email: profile.email ?? null,
        company_name: profile.companyName ?? null,
        tax_rate: profile.taxRate ?? null,
      },
      { onConflict: 'id' }
    );
    if (error) {
      throw error;
    }
  },

  async saveCategories(userId: string, categories: ExpenseCategory[]) {
    if (!categories.length) {
      return;
    }

    const upserts = categories.map((category) => ({
      name: category,
      user_id: userId,
    }));

    const { error } = await supabase.from('categories').upsert(upserts, {
      onConflict: 'user_id,name',
    });

    if (error) {
      throw error;
    }
  },

  async deleteCategory(userId: string, category: ExpenseCategory) {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('user_id', userId)
      .eq('name', category);

    if (error) {
      throw error;
    }
  },

  async renameCategory(userId: string, category: ExpenseCategory, nextName: ExpenseCategory) {
    const trimmedCurrent = category.trim();
    const trimmedNext = nextName.trim();
    if (!trimmedCurrent || !trimmedNext) {
      throw new Error('Le nom de catégorie est vide.');
    }
    if (trimmedCurrent.toLowerCase() === trimmedNext.toLowerCase()) {
      return;
    }

    const { data: conflict } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', userId)
      .eq('name', trimmedNext)
      .maybeSingle();

    if (conflict) {
      throw new Error('La catégorie existe déjà.');
    }

    const { error: renameError } = await supabase
      .from('categories')
      .update({ name: trimmedNext })
      .eq('user_id', userId)
      .eq('name', trimmedCurrent);

    if (renameError) {
      throw renameError;
    }

    const { error: expensesError } = await supabase
      .from('expenses')
      .update({ category: trimmedNext })
      .eq('user_id', userId)
      .eq('category', trimmedCurrent);

    if (expensesError) {
      throw expensesError;
    }
  },

  async setNotificationRead(notificationId: string, read: boolean) {
    const { error } = await supabase.from('notifications').update({ read }).eq('id', notificationId);
    if (error) {
      throw error;
    }
  },

  async deleteNotification(notificationId: string) {
    const { error } = await supabase.from('notifications').delete().eq('id', notificationId);
    if (error) {
      throw error;
    }
  },

  async renameNotification(notificationId: string, message: string) {
    const { error } = await supabase.from('notifications').update({ message }).eq('id', notificationId);
    if (error) {
      throw error;
    }
  },

  async upsertNotifications(notifications: Notification[], userId: string) {
    if (!notifications.length) {
      return;
    }
    const payload = notifications.map((notif) => ({
      id: notif.id,
      user_id: userId,
      message: notif.message,
      type: notif.type,
      timestamp: notif.timestamp,
      read: notif.read,
      job_id: notif.jobId ?? null,
    }));
    const { error } = await supabase.from('notifications').upsert(payload);
    if (error) {
      throw error;
    }
  },

  async upsertMessages(messages: ChatMessage[], userId: string) {
    if (!messages.length) {
      return;
    }

    const conversationMeta = new Map<
      string,
      { hasUserMessage: boolean; lastMessageAt: string; lastMessagePreview?: string; lastUserMessageAt?: string }
    >();

    const payload = messages.map((message) => ({
      id: message.id,
      user_id: userId,
      conversation_id: message.conversationId,
      sender: message.sender,
      text: message.text,
      timestamp: message.timestamp,
      custom_title: message.customTitle ?? null,
      job_summary: message.jobSummary ?? null,
      retain: true,
      receipt_path: message.receiptPath ?? null,
      receipt_ocr: message.receiptOcrData ?? null,
    }));
    const { error } = await supabase.from('messages').upsert(payload);
    if (error) {
      throw error;
    }

    messages.forEach((message) => {
      const existing =
        conversationMeta.get(message.conversationId) ?? {
          hasUserMessage: false,
          lastMessageAt: message.timestamp,
          lastMessagePreview: undefined as string | undefined,
          lastUserMessageAt: undefined as string | undefined,
        };

      const messageTimestamp = new Date(message.timestamp).getTime();
      const currentLastTimestamp = new Date(existing.lastMessageAt).getTime();

      if (messageTimestamp > currentLastTimestamp) {
        existing.lastMessageAt = message.timestamp;
      }

      if (message.sender === 'user') {
        const lastUserTimestamp = existing.lastUserMessageAt
          ? new Date(existing.lastUserMessageAt).getTime()
          : -Infinity;
        if (messageTimestamp >= lastUserTimestamp) {
          existing.lastMessagePreview = message.text;
          existing.lastUserMessageAt = message.timestamp;
        }
        existing.hasUserMessage = true;
      }

      conversationMeta.set(message.conversationId, existing);
    });

    await Promise.all(
      Array.from(conversationMeta.entries()).map(([conversationId, meta]) =>
        dataService.updateConversationState(userId, conversationId, {
          hasUserMessage: meta.hasUserMessage,
          lastMessageAt: meta.lastMessageAt,
          lastMessagePreview: meta.lastMessagePreview,
        })
      )
    );
  },

  async deleteMessage(messageId: string) {
    const { error } = await supabase.from('messages').delete().eq('id', messageId);
    if (error) {
      throw error;
    }
  },
};

