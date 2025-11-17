import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Job,
  Expense,
  ChatMessage,
  Screen,
  ExpenseCategory,
  UserProfile,
  Notification,
  Conversation,
} from './types';
import {
  AuthScreen,
  OnboardingScreen,
  DashboardScreen,
  JobsScreen,
  JobDetailScreen,
  ExpensesScreen,
  ChatScreen,
  SettingsScreen,
  ReportsScreen,
  ResetPasswordScreen,
  Toast,
  AddJobModal,
  AddExpenseModal,
  ManageCategoriesModal,
  SidebarConversationHistory,
  SidebarNotifications,
} from './components';
import { NAVIGATION_ITEMS, DESKTOP_NAVIGATION_ITEMS, Logo, PlusIcon } from './constants';
import { authService } from './services/authService';
import { dataService } from './services/dataService';
import { financialService } from './services/financialService';
import { createMessageId } from './services/chatUtils';

const DEFAULT_CATEGORIES: ExpenseCategory[] = ['Matériel', 'Essence', 'Outils', 'Sous-traitant', 'Autre'];

const createWelcomeMessage = (conversationId: string): ChatMessage => ({
  id: createMessageId('ai'),
  conversationId,
  sender: 'ai',
  text: "Bonjour! Je suis Fiscalia. Comment puis-je vous aider à gérer vos finances aujourd'hui?",
  timestamp: new Date().toISOString(),
});

const conversationSortValue = (conversation: Conversation): number => {
  const fallback = conversation.lastMessageAt ?? conversation.updatedAt ?? conversation.createdAt;
  return new Date(fallback ?? new Date().toISOString()).getTime();
};

const sortConversationsDesc = (list: Conversation[]): Conversation[] =>
  [...list].sort((a, b) => conversationSortValue(b) - conversationSortValue(a));

const LOCAL_CONVERSATION_KEY_PREFIX = 'fiscalia.conversationMessages.';

const getLocalStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const buildLocalConversationKey = (userId: string) => `${LOCAL_CONVERSATION_KEY_PREFIX}${userId}`;

const isValidChatMessage = (value: unknown): value is ChatMessage => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as ChatMessage;
  if (typeof candidate.id !== 'string' || typeof candidate.conversationId !== 'string') {
    return false;
  }
  if (candidate.sender !== 'user' && candidate.sender !== 'ai') {
    return false;
  }
  if (typeof candidate.text !== 'string' || typeof candidate.timestamp !== 'string') {
    return false;
  }
  return true;
};

const readLocalConversationMessages = (userId: string): Record<string, ChatMessage[]> => {
  const storage = getLocalStorage();
  if (!storage) {
    return {};
  }
  try {
    const raw = storage.getItem(buildLocalConversationKey(userId));
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, ChatMessage[]>>(
      (acc, [conversationId, rawMessages]) => {
        if (!Array.isArray(rawMessages)) {
          return acc;
        }
        const messages = rawMessages.filter(isValidChatMessage) as ChatMessage[];
        if (messages.length) {
          acc[conversationId] = messages.map((message) => ({ ...message }));
        }
        return acc;
      },
      {}
    );
  } catch (error) {
    console.error('Failed to read local conversation cache', error);
    return {};
  }
};

const writeLocalConversationMessages = (userId: string, messages: Record<string, ChatMessage[]>) => {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(buildLocalConversationKey(userId), JSON.stringify(messages));
  } catch (error) {
    console.error('Failed to persist local conversation cache', error);
  }
};

const mergeMessagesByConversation = (
  previous: Record<string, ChatMessage[]>,
  incoming: Record<string, ChatMessage[]>
): Record<string, ChatMessage[]> => {
  const conversationIds = new Set([...Object.keys(previous), ...Object.keys(incoming)]);
  const merged: Record<string, ChatMessage[]> = {};

  conversationIds.forEach((conversationId) => {
    const mergedMessages = new Map<string, ChatMessage>();

    const pushMessage = (message: ChatMessage) => {
      const existing = mergedMessages.get(message.id);
      if (!existing) {
        mergedMessages.set(message.id, message);
        return;
      }
      const existingTime = new Date(existing.timestamp).getTime();
      const candidateTime = new Date(message.timestamp).getTime();
      // Prefer message with receiptPath if timestamps are equal (database version has receiptPath)
      if (Number.isNaN(existingTime) || Number.isNaN(candidateTime) || candidateTime > existingTime) {
        mergedMessages.set(message.id, message);
      } else if (candidateTime === existingTime) {
        // If timestamps are equal, prefer the one with receiptPath (from database)
        if (message.receiptPath && !existing.receiptPath) {
          mergedMessages.set(message.id, message);
        } else if (!message.receiptPath && existing.receiptPath) {
          // Keep existing if it has receiptPath and new one doesn't
          mergedMessages.set(message.id, existing);
        } else {
          // Merge receiptPath and receiptOcrData if one has it and the other doesn't
          const merged = { ...existing };
          if (message.receiptPath && !existing.receiptPath) {
            merged.receiptPath = message.receiptPath;
          }
          if (message.receiptOcrData && !existing.receiptOcrData) {
            merged.receiptOcrData = message.receiptOcrData;
          }
          mergedMessages.set(message.id, merged);
        }
      }
    };

    (previous[conversationId] ?? []).forEach(pushMessage);
    (incoming[conversationId] ?? []).forEach(pushMessage);

    merged[conversationId] = Array.from(mergedMessages.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  });

  return merged;
};

const chunkArray = <T,>(input: T[], chunkSize: number): T[][] => {
  if (!Array.isArray(input) || input.length === 0) {
    return [];
  }
  const size = Number.isFinite(chunkSize) && chunkSize > 0 ? Math.floor(chunkSize) : input.length;
  if (size >= input.length) {
    return [input];
  }
  const chunks: T[][] = [];
  for (let index = 0; index < input.length; index += size) {
    chunks.push(input.slice(index, index + size));
  }
  return chunks;
};

const generateConversationTitle = (message: string): string => {
  const cleaned = message.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'Nouvelle conversation';
  }
  const words = cleaned.split(' ');
  const snippet = words.slice(0, 6).join(' ');
  return snippet.charAt(0).toUpperCase() + snippet.slice(1);
};

const useResponsive = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
};

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isPasswordResetMode, setIsPasswordResetMode] = useState(false);

  const [isOnboarding, setIsOnboarding] = useState(false);
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationMessages, setConversationMessages] = useState<Record<string, ChatMessage[]>>({});
  const conversationMessagesRef = useRef<Record<string, ChatMessage[]>>({});
  const userIdRef = useRef<string | null>(null);
  const setTrackedConversationMessages = useCallback(
    (updater: React.SetStateAction<Record<string, ChatMessage[]>>) => {
      setConversationMessages((prev) => {
        const next =
          typeof updater === 'function'
            ? (updater as (value: Record<string, ChatMessage[]>) => Record<string, ChatMessage[]>)(prev)
            : updater;
        conversationMessagesRef.current = next;
        if (userIdRef.current) {
          writeLocalConversationMessages(userIdRef.current, next);
        }
        return next;
      });
    },
    []
  );
  const pendingChatOperationsRef = useRef<Set<Promise<unknown>>>(new Set());
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>(DEFAULT_CATEGORIES);
  const [userProfile, setUserProfile] = useState<UserProfile>({ name: '' });
  const [isAccountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    userIdRef.current = session?.user?.id ?? null;
  }, [session]);

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAccountMenuOpen]);

  const handleAccountButtonClick = () => {
    setAccountMenuOpen((prev) => !prev);
  };

  const handleAccountMenuNavigateToSettings = () => {
    setScreen('settings');
    setAccountMenuOpen(false);
  };

  const handleAccountMenuSignOut = () => {
    setAccountMenuOpen(false);
    handleSignOut();
  };

  const [isAddJobModalOpen, setAddJobModalOpen] = useState(false);
  const [isAddExpenseModalOpen, setAddExpenseModalOpen] = useState(false);
  const [expenseModalMode, setExpenseModalMode] = useState<'create' | 'edit'>('create');
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  const [expenseModalJobId, setExpenseModalJobId] = useState<string | null | undefined>(undefined);
  const [isManageCategoriesModalOpen, setManageCategoriesModalOpen] = useState(false);

  const [toastMessage, setToastMessage] = useState('');
  const [isToastVisible, setIsToastVisible] = useState(false);

  const isMobile = useResponsive();

  const registerPendingChatOperation = useCallback((operation: Promise<unknown>) => {
    if (!operation || typeof operation.finally !== 'function') {
      return;
    }
    pendingChatOperationsRef.current.add(operation);
    operation.finally(() => {
      pendingChatOperationsRef.current.delete(operation);
    });
  }, []);

  const awaitPendingChatOperations = useCallback(async () => {
    while (pendingChatOperationsRef.current.size) {
      const operations = Array.from(pendingChatOperationsRef.current);
      const results = await Promise.allSettled(operations);
      results.forEach((result) => {
        if (result.status === 'rejected') {
          console.error('Pending chat operation failed', result.reason);
        }
      });
    }
  }, []);

  const resolveActiveUserId = useCallback(async (): Promise<string | null> => {
    if (session?.user?.id) {
      userIdRef.current = session.user.id;
      return session.user.id;
    }
    try {
      const user = await authService.getUser();
      if (user?.id) {
        userIdRef.current = user.id;
      }
      return user?.id ?? null;
    } catch (error) {
      console.error('Failed to resolve active user id', error);
      return null;
    }
  }, [session]);

  const activeConversation = useMemo(() => {
    if (activeConversationId) {
      return conversations.find((conversation) => conversation.id === activeConversationId) ?? null;
    }
    return conversations[0] ?? null;
  }, [activeConversationId, conversations]);

  const activeMessages = useMemo(() => {
    if (!activeConversation) {
      return [];
    }
    return conversationMessages[activeConversation.id] ?? [];
  }, [activeConversation, conversationMessages]);

  useEffect(() => {
    if (!activeConversationId && activeConversation) {
      setActiveConversationId(activeConversation.id);
    }
  }, [activeConversationId, activeConversation]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setIsToastVisible(true);
    window.setTimeout(() => setIsToastVisible(false), 3000);
  }, []);

  const openCreateExpenseModal = useCallback((jobId?: string | null) => {
    setExpenseModalMode('create');
    setExpenseToEdit(null);
    setExpenseModalJobId(jobId);
    setAddExpenseModalOpen(true);
  }, []);

  const openEditExpenseModal = useCallback((expense: Expense) => {
    setExpenseModalMode('edit');
    setExpenseToEdit(expense);
    setExpenseModalJobId(expense.jobId ?? null);
    setAddExpenseModalOpen(true);
  }, []);

  const closeExpenseModal = useCallback(() => {
    setAddExpenseModalOpen(false);
    setExpenseToEdit(null);
    setExpenseModalJobId(undefined);
    setExpenseModalMode('create');
  }, []);

  const resetAppState = useCallback(() => {
    userIdRef.current = null;
    setJobs([]);
    setExpenses([]);
    setConversations([]);
    setTrackedConversationMessages({});
    setActiveConversationId(null);
    setNotifications([]);
    setCategories(DEFAULT_CATEGORIES);
    setUserProfile({ name: '' });
    setSelectedJob(null);
    setScreen('dashboard');
    setIsOnboarding(false);
  }, [setTrackedConversationMessages]);

  const ensureSession = useCallback(() => {
    if (!session) {
      showToast('Veuillez vous connecter pour poursuivre.');
      return false;
    }
    return true;
  }, [session, showToast]);

  const loadUserData = useCallback(
    async (activeSession: Session) => {
      setIsDataLoading(true);
      try {
        userIdRef.current = activeSession.user.id;
        const cachedMessages = readLocalConversationMessages(activeSession.user.id);
        if (Object.keys(cachedMessages).length) {
          setTrackedConversationMessages(cachedMessages);
        }
        const data = await dataService.loadData(activeSession.user.id);
        setJobs(data.jobs);
        setExpenses(data.expenses);

        const nextCategories = data.categories.length ? data.categories : DEFAULT_CATEGORIES;
        setCategories(nextCategories);
        if (!data.categories.length) {
          await dataService.saveCategories(activeSession.user.id, DEFAULT_CATEGORIES);
        }

        const nextMessagesByConversation: Record<string, ChatMessage[]> = { ...data.messagesByConversation };
        let orderedConversations = sortConversationsDesc(data.conversations);

        orderedConversations.forEach((conversation) => {
          if (!nextMessagesByConversation[conversation.id]) {
            nextMessagesByConversation[conversation.id] = [];
          }
        });

        let workingConversations = orderedConversations;

        const localMessagesByConversation = readLocalConversationMessages(activeSession.user.id);

        const mergedLocalAndInMemory = mergeMessagesByConversation(localMessagesByConversation, conversationMessagesRef.current);

        const mergedMessagesByConversation = mergeMessagesByConversation(
          mergedLocalAndInMemory,
          nextMessagesByConversation
        );

        const supabaseMessagesByConversation = nextMessagesByConversation;
        const messagesNeedingSync: ChatMessage[] = [];
        const dedupeSyncIds = new Set<string>();

        Object.entries(mergedMessagesByConversation).forEach(([conversationId, mergedMessages]) => {
          if (!conversationId || !mergedMessages.length) {
            return;
          }
          const supabaseMessages = supabaseMessagesByConversation[conversationId] ?? [];
          const supabaseIndex = new Map<string, ChatMessage>(supabaseMessages.map((message) => [message.id, message]));

          mergedMessages.forEach((message) => {
            if (!message.id || !message.conversationId) {
              return;
            }

            const stored = supabaseIndex.get(message.id);
            const requiresSync =
              !stored ||
              stored.text !== message.text ||
              stored.timestamp !== message.timestamp ||
              stored.sender !== message.sender ||
              stored.receiptPath !== message.receiptPath ||
              JSON.stringify(stored.receiptOcrData) !== JSON.stringify(message.receiptOcrData);

            if (requiresSync && !dedupeSyncIds.has(message.id)) {
              messagesNeedingSync.push(message);
              dedupeSyncIds.add(message.id);
            }
          });
        });

        if (messagesNeedingSync.length) {
          const messageChunks = chunkArray(messagesNeedingSync, 200);
          for (const chunk of messageChunks) {
            const syncPromise = dataService.upsertMessages(chunk, activeSession.user.id);
            registerPendingChatOperation(syncPromise);
            try {
              await syncPromise;
            } catch (syncError) {
              console.error('Failed to backfill Supabase messages', syncError);
              showToast('Impossible de synchroniser certains messages récents avec Supabase.');
              break;
            }
          }
        }

        const enrichedConversations = workingConversations.map((conversation) => {
          const messages = mergedMessagesByConversation[conversation.id] ?? [];
          if (!messages.length) {
            return conversation;
          }
          const lastMessage = messages[messages.length - 1];
          const lastUserMessage = [...messages].reverse().find((msg) => msg.sender === 'user');
          return {
            ...conversation,
            hasUserMessage: messages.some((msg) => msg.sender === 'user'),
            lastMessageAt: lastMessage.timestamp,
            lastMessagePreview: lastUserMessage?.text,
          };
        });

        const finalConversations = sortConversationsDesc(enrichedConversations);
        const fallbackConversationId = finalConversations[0]?.id ?? null;

        setConversations(finalConversations);
        setTrackedConversationMessages((current) => {
          const next = mergeMessagesByConversation(current, mergedMessagesByConversation);
          writeLocalConversationMessages(activeSession.user.id, next);
          return next;
        });
        setActiveConversationId((current) => current ?? fallbackConversationId);

        setNotifications(data.notifications);
        const profile = data.profile ?? { name: '' };
        setUserProfile({
          name: profile.name || '',
          email: profile.email,
          companyName: profile.companyName,
          taxRate: profile.taxRate,
        });
        setIsOnboarding(!profile?.name);
        setSelectedJob(null);
        setScreen('dashboard');
      } catch (error) {
        console.error('Failed to load Supabase data', error);
        showToast('Impossible de charger les données depuis Supabase.');
      } finally {
        setIsDataLoading(false);
      }
    },
    [registerPendingChatOperation, setTrackedConversationMessages, showToast]
  );

  useEffect(() => {
    // Check for password reset token in URL hash
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const type = hashParams.get('type');
    
    // Check if we're on a password reset flow
    // Note: Don't clear the hash yet - Supabase needs it to establish the session
    if (type === 'recovery' && accessToken) {
      setIsPasswordResetMode(true);
      // Wait a bit for Supabase to process the token and establish the session
      // The session will be established via onAuthStateChange
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    authService.getSession().then(async (currentSession) => {
      if (!mounted) return;
      setSession(currentSession);
      
      // If we're in password reset mode, don't load user data
      if (isPasswordResetMode) {
        setIsAuthLoading(false);
        return;
      }
      
      if (currentSession) {
        await loadUserData(currentSession);
        const cachedMessages = readLocalConversationMessages(currentSession.user.id);
        if (Object.keys(cachedMessages).length) {
          setTrackedConversationMessages(cachedMessages);
        }
      } else {
        await awaitPendingChatOperations();
        resetAppState();
      }
      setIsAuthLoading(false);
    });

    const unsubscribe = authService.onAuthStateChange(async (nextSession, event) => {
      if (!mounted) return;
      
      // Check URL hash for password reset token
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const type = hashParams.get('type');
      
      // If this is a password recovery event, set password reset mode
      if (event === 'PASSWORD_RECOVERY' || (type === 'recovery' && accessToken && nextSession)) {
        setIsPasswordResetMode(true);
        // Now we can safely clear the hash after session is established
        if (type === 'recovery' && accessToken) {
          setTimeout(() => {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }, 100);
        }
        setSession(nextSession);
        setIsAuthLoading(false);
        return;
      }
      
      setSession(nextSession);
      
      if (isPasswordResetMode) {
        setIsAuthLoading(false);
        return;
      }
      
      if (nextSession) {
        await loadUserData(nextSession);
      } else {
        await awaitPendingChatOperations();
        resetAppState();
      }
      setIsAuthLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [awaitPendingChatOperations, loadUserData, resetAppState, isPasswordResetMode]);

  const handleSignIn = useCallback(
    async ({ email, password }: { email: string; password: string }) => {
      setAuthError(null);
      setIsAuthLoading(true);
      try {
        const sessionData = await authService.signIn({ email, password });
        if (sessionData) {
          setSession(sessionData);
          await loadUserData(sessionData);
        }
      } catch (error) {
        console.error('signIn error', error);
        setAuthError(error instanceof Error ? error.message : 'Erreur lors de la connexion.');
      } finally {
        setIsAuthLoading(false);
      }
    },
    [loadUserData]
  );

  const handleForgotPassword = useCallback(
    async (email: string) => {
      try {
        await authService.requestPasswordReset(email);
      } catch (error) {
        console.error('forgotPassword error', error);
        throw error;
      }
    },
    []
  );

  const handleSignUp = useCallback(
    async ({ email, password, name }: { email: string; password: string; name?: string }) => {
      setAuthError(null);
      setIsAuthLoading(true);
      try {
        const sessionData = await authService.signUp({ email, password, name });
        if (!sessionData) {
          showToast('Confirmez votre adresse courriel pour terminer la création du compte.');
          setAuthMode('signin');
          return;
        }
        await dataService.upsertProfile(sessionData.user.id, { name: name || '', email });
        await dataService.saveCategories(sessionData.user.id, DEFAULT_CATEGORIES);
        setSession(sessionData);
        await loadUserData(sessionData);
        showToast('Compte créé avec succès.');
      } catch (error) {
        console.error('signUp error', error);
        setAuthError(error instanceof Error ? error.message : 'Erreur lors de la création du compte.');
      } finally {
        setIsAuthLoading(false);
      }
    },
    [loadUserData, showToast]
  );

  const handleSignOut = useCallback(async () => {
    try {
      const activeUserId = session?.user?.id;
      if (activeUserId) {
        writeLocalConversationMessages(activeUserId, conversationMessagesRef.current);
      }
      await awaitPendingChatOperations();
    } catch (error) {
      console.error('Failed to flush pending chat operations before sign-out', error);
    }

    try {
      await authService.signOut();
    } catch (error) {
      console.error('signOut error', error);
    } finally {
      setSession(null);
      resetAppState();
      setAuthMode('signin');
      showToast('Déconnexion réussie.');
    }
  }, [awaitPendingChatOperations, resetAppState, showToast]);

  const truncateMessageForMemory = (input: string, maxLength: number): string => {
    if (!input) {
      return '';
    }
    if (input.length <= maxLength) {
      return input;
    }
    return `${input.slice(0, maxLength - 1).trim()}…`;
  };

  const createConversationMemorySummary = (messages: ChatMessage[]): string | null => {
    if (!messages.length) {
      return null;
    }

    // Extract user messages and AI messages
    const userMessages = messages.filter((msg) => msg.sender === 'user');
    const aiMessages = messages.filter((msg) => msg.sender === 'ai');

    if (!userMessages.length) {
      return null;
    }

    // 1. Conversation goal (first user message)
    const firstUserMessage = userMessages[0];
    const goal = truncateMessageForMemory(firstUserMessage.text, 120);

    // 2. Recent context (last 3 exchanges)
    const recentContext: string[] = [];
    const recentMessages = messages.slice(-6); // Last 3 exchanges (6 messages)
    for (let i = 0; i < recentMessages.length; i++) {
      const msg = recentMessages[i];
      if (msg.sender === 'user') {
        recentContext.push(`U: ${truncateMessageForMemory(msg.text, 80)}`);
      } else {
        recentContext.push(`A: ${truncateMessageForMemory(msg.text, 80)}`);
      }
    }

    // 3. Extract frequently mentioned entities
    const allText = userMessages.map((m) => m.text.toLowerCase()).join(' ');
    const entities: string[] = [];

    // Common job/vendor names (if mentioned multiple times)
    const words = allText.split(/\s+/);
    const wordFreq = new Map<string, number>();
    words.forEach((word) => {
      if (word.length > 3 && !/^\d+$/.test(word)) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    });

    // Keywords that indicate preferences or recurring themes
    const keywords = ['toujours', 'habituellement', 'généralement', 'souvent', 'préfère', 'aime'];
    const preferences: string[] = [];
    userMessages.forEach((msg) => {
      const lowerText = msg.text.toLowerCase();
      keywords.forEach((keyword) => {
        if (lowerText.includes(keyword)) {
          // Extract sentence with preference
          const sentences = msg.text.split(/[.!?]+/);
          sentences.forEach((sentence) => {
            if (sentence.toLowerCase().includes(keyword)) {
              preferences.push(truncateMessageForMemory(sentence.trim(), 100));
            }
          });
        }
      });
    });

    // 4. Actions performed (inferred from AI responses mentioning success)
    const actionsPerformed: string[] = [];
    aiMessages.slice(-5).forEach((msg) => {
      const lowerText = msg.text.toLowerCase();
      if (
        lowerText.includes('créé') ||
        lowerText.includes('ajouté') ||
        lowerText.includes('modifié') ||
        lowerText.includes('supprimé') ||
        lowerText.includes('mis à jour')
      ) {
        actionsPerformed.push(truncateMessageForMemory(msg.text, 80));
      }
    });

    // Build memory summary
    const sections: string[] = [];

    sections.push(`Objectif: ${goal}`);

    if (recentContext.length > 0) {
      sections.push(`Contexte récent:\n${recentContext.join('\n')}`);
    }

    if (preferences.length > 0) {
      sections.push(`Préférences: ${preferences.slice(0, 2).join(' | ')}`);
    }

    if (actionsPerformed.length > 0) {
      sections.push(`Actions récentes: ${actionsPerformed.slice(0, 3).join(' → ')}`);
    }

    return sections.join('\n');
  };

  const syncConversationSnapshot = useCallback(
    (conversationId: string, messages: ChatMessage[], memorySummary?: string | null) => {
    setConversations((prev) => {
      let found = false;
      const updated = prev.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }
        found = true;
          const nextMemory = memorySummary === undefined ? conversation.memorySummary : memorySummary ?? undefined;
        if (!messages.length) {
          return {
            ...conversation,
            hasUserMessage: false,
            lastMessagePreview: undefined,
            lastMessageAt: conversation.lastMessageAt,
              memorySummary: nextMemory,
          };
        }
        const lastMessage = messages[messages.length - 1];
        const lastUserMessage = [...messages].reverse().find((msg) => msg.sender === 'user');
        return {
          ...conversation,
          hasUserMessage: messages.some((msg) => msg.sender === 'user'),
          lastMessageAt: lastMessage.timestamp,
          lastMessagePreview: lastUserMessage?.text,
            memorySummary: nextMemory,
        };
      });

      if (!found) {
        return prev;
      }

      return sortConversationsDesc(updated);
    });
    },
    []
  );

  const updateConversationMessages = useCallback(
    async (conversationId: string, updater: React.SetStateAction<ChatMessage[]>) => {
      let nextMessages: ChatMessage[] = [];
      let previousMessagesSnapshot: ChatMessage[] = [];
      let conversationSummary: string | null = null;

      setTrackedConversationMessages((prev) => {
        const previousMessages = prev[conversationId] ?? [];
        previousMessagesSnapshot = previousMessages;
        nextMessages =
          typeof updater === 'function'
            ? (updater as (value: ChatMessage[]) => ChatMessage[])(previousMessages)
            : updater;
        conversationSummary = createConversationMemorySummary(nextMessages);
        return {
          ...prev,
          [conversationId]: nextMessages,
        };
      });

      syncConversationSnapshot(conversationId, nextMessages, conversationSummary);

      try {
        const userId = await resolveActiveUserId();
        if (!userId) {
          return;
        }

        const persistPromise = dataService.upsertMessages(nextMessages, userId);
        registerPendingChatOperation(persistPromise);
        await persistPromise;

        await dataService.updateConversationState(userId, conversationId, {
          memorySummary: conversationSummary ?? undefined,
        });

        const removedMessages = previousMessagesSnapshot.filter(
          (message) => !nextMessages.some((nextMessage) => nextMessage.id === message.id)
        );

        if (removedMessages.length) {
          await Promise.allSettled(
            removedMessages.map((message) => dataService.deleteMessage(message.id).catch((error) => {
              console.error('Failed to delete message', error);
            }))
          );
        }
      } catch (error) {
        console.error('Failed to persist messages', error);
      }
    },
    [registerPendingChatOperation, resolveActiveUserId, setTrackedConversationMessages, syncConversationSnapshot]
  );

  type StartConversationOptions = {
    focusAssistant?: boolean;
  };

  const handleStartConversation = useCallback(async (options?: StartConversationOptions): Promise<string | null> => {
    if (!ensureSession()) {
      return null;
    }

    const shouldFocusAssistant = options?.focusAssistant ?? true;

    try {
      const conversation = await dataService.createConversation(session!.user.id);

      setTrackedConversationMessages((prev) => ({
        ...prev,
        [conversation.id]: [],
      }));

      setConversations((prev) =>
        sortConversationsDesc([
          {
            ...conversation,
            hasUserMessage: false,
            lastMessagePreview: undefined,
          },
          ...prev,
        ])
      );

      setActiveConversationId(conversation.id);
      if (shouldFocusAssistant) {
        setScreen('assistant');
      }

      return conversation.id;
    } catch (error) {
      console.error('Failed to create conversation', error);
      showToast('Impossible de créer une nouvelle conversation.');
      return null;
    }
  }, [ensureSession, session, setTrackedConversationMessages, showToast, setScreen]);

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      if (conversationId === activeConversationId) {
        setScreen('assistant');
        return;
      }
      if (conversations.some((conversation) => conversation.id === conversationId)) {
        setActiveConversationId(conversationId);
        setScreen('assistant');
      }
    },
    [activeConversationId, conversations, setScreen]
  );

  const handleRenameConversation = useCallback(
    async (conversationId: string, newTitle: string) => {
      if (!ensureSession()) {
        return;
      }
      const formattedTitle = newTitle.trim();
      if (!formattedTitle.length) {
        showToast('Le titre ne peut pas être vide.');
        return;
      }
      try {
        await dataService.renameConversation(session!.user.id, conversationId, formattedTitle);
        setConversations((prev) =>
          sortConversationsDesc(
            prev.map((conversation) =>
              conversation.id === conversationId ? { ...conversation, title: formattedTitle } : conversation
            )
          )
        );
      } catch (error) {
        console.error('Failed to rename conversation', error);
        showToast("Impossible de renommer la conversation.");
      }
    },
    [ensureSession, session, showToast]
  );

  const handleFirstUserMessage = useCallback(
    async (conversationId: string, messageText: string) => {
      let shouldRename = false;
      let shouldUpdateHasUserMessage = false;
      let previousTitle = '';
      const derivedTitle = generateConversationTitle(messageText);

      setConversations((prev) => {
        let wasUpdated = false;
        const updated = prev.map((conversation) => {
          if (conversation.id !== conversationId) {
            return conversation;
          }
          previousTitle = conversation.title;
          shouldRename = conversation.title === 'Nouvelle conversation';
          shouldUpdateHasUserMessage = !conversation.hasUserMessage;
          if (!shouldRename && !shouldUpdateHasUserMessage) {
            return conversation;
          }
          wasUpdated = true;
          return {
            ...conversation,
            title: shouldRename ? derivedTitle : conversation.title,
            hasUserMessage: true,
          };
        });

        if (!wasUpdated) {
          return prev;
        }

        return sortConversationsDesc(updated);
      });

      if (!shouldRename && !shouldUpdateHasUserMessage) {
        return;
      }

      if (!ensureSession()) {
        return;
      }

      try {
        if (shouldUpdateHasUserMessage) {
          await dataService.updateConversationState(session!.user.id, conversationId, {
            hasUserMessage: true,
          });
        }

        if (shouldRename && derivedTitle !== previousTitle) {
          await dataService.renameConversation(session!.user.id, conversationId, derivedTitle);
        }
      } catch (error) {
        console.error('Failed to finalize conversation metadata', error);
        showToast("Impossible de mettre à jour la conversation.");
      }
    },
    [ensureSession, session, showToast]
  );

  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      if (!ensureSession()) {
        return;
      }

      const nextConversations = conversations.filter((conversation) => conversation.id !== conversationId);
      const nextActiveId =
        conversationId === activeConversationId ? nextConversations[0]?.id ?? null : activeConversationId;

      setConversations(nextConversations);
      setTrackedConversationMessages((prev) => {
        const { [conversationId]: _removed, ...rest } = prev;
        return rest;
      });
      setActiveConversationId(nextActiveId ?? null);

      if (!session) {
        return;
      }

      try {
        await dataService.deleteConversation(session.user.id, conversationId);
        showToast('Conversation supprimée.');
      } catch (error) {
        console.error('Failed to delete conversation', error);
        showToast("Impossible de supprimer la conversation.");
        if (session) {
          await loadUserData(session);
        }
      }
    },
    [ensureSession, conversations, activeConversationId, session, setTrackedConversationMessages, showToast, loadUserData]
  );

  const handleConversationMessagesUpdate = useCallback(
    (conversationId: string, updater: React.SetStateAction<ChatMessage[]>) => {
      return updateConversationMessages(conversationId, updater);
    },
    [updateConversationMessages]
  );

  const addCategory = useCallback(
    async (categoryName: string) => {
      const formatted = categoryName.trim();
      if (!formatted) {
        showToast('La catégorie est vide.');
        return;
      }
      if (categories.find((c) => c.toLowerCase() === formatted.toLowerCase())) {
        showToast('La catégorie existe déjà.');
        return;
      }
      setCategories((prev) => [...prev, formatted].sort());
      if (ensureSession()) {
        try {
          await dataService.saveCategories(session!.user.id, [formatted]);
          showToast('Catégorie ajoutée !');
        } catch (error) {
          console.error('Failed to save category', error);
          showToast("Impossible d'enregistrer la catégorie.");
          setCategories((prev) => prev.filter((cat) => cat !== formatted));
          throw error instanceof Error ? error : new Error("Impossible d'enregistrer la catégorie.");
        }
      }
    },
    [categories, ensureSession, session, showToast]
  );

  const deleteCategory = useCallback(
    async (categoryName: string) => {
      if (categoryName === 'Autre') {
        showToast('La catégorie "Autre" est toujours disponible.');
        return;
      }
      if (!ensureSession()) return;

      const previousCategories = categories;
      const nextCategories = previousCategories.filter((cat) => cat !== categoryName);
      if (nextCategories.length === previousCategories.length) {
        return;
      }

      setCategories(nextCategories);
      try {
        await dataService.deleteCategory(session!.user.id, categoryName);
        showToast('Catégorie supprimée.');
      } catch (error) {
        console.error('Failed to delete category', error);
        showToast("Impossible de supprimer la catégorie.");
        setCategories(previousCategories);
        throw error instanceof Error ? error : new Error("Impossible de supprimer la catégorie.");
      }
    },
    [categories, ensureSession, session, showToast]
  );

  const renameCategory = useCallback(
    async (currentName: string, nextName: string) => {
      const current = currentName.trim();
      const next = nextName.trim();
      if (!current || !next) {
        showToast('La catégorie ne peut pas être vide.');
        return;
      }
      if (current.toLowerCase() === next.toLowerCase()) {
        return;
      }
      const hasCategory = categories.some((category) => category.toLowerCase() === current.toLowerCase());
      if (!hasCategory) {
        showToast('Catégorie introuvable.');
        return;
      }
      const previousCategories = categories;
      const previousExpenses = expenses;
      setCategories((prev) =>
        prev
          .map((category) => (category.toLowerCase() === current.toLowerCase() ? next : category))
          .sort((a, b) => a.localeCompare(b, 'fr-CA'))
      );
      setExpenses((prev) =>
        prev.map((expense) =>
          expense.category.toLowerCase() === current.toLowerCase() ? { ...expense, category: next } : expense
        )
      );
      try {
        if (!ensureSession()) {
          throw new Error('Session invalide');
        }
        await dataService.renameCategory(session!.user.id, current, next);
        showToast('Catégorie renommée.');
      } catch (error) {
        console.error('Failed to rename category', error);
        showToast("Impossible de renommer la catégorie.");
        setCategories(previousCategories);
        setExpenses(previousExpenses);
        throw error instanceof Error ? error : new Error("Impossible de renommer la catégorie.");
      }
    },
    [categories, expenses, ensureSession, session, showToast]
  );

  const refreshData = useCallback(async () => {
    if (!ensureSession()) {
      return;
    }
    setIsDataLoading(true);
    try {
      const data = await dataService.loadData(session!.user.id);
      setJobs(data.jobs);
      setExpenses(data.expenses);
      const nextCategories = data.categories.length ? data.categories : DEFAULT_CATEGORIES;
      setCategories(nextCategories);
      setNotifications(data.notifications);
      setSelectedJob((prev) => {
        if (!prev) {
          return prev;
        }
        const updated = data.jobs.find((job) => job.id === prev.id);
        return updated ?? prev;
      });
    } catch (error) {
      console.error('Failed to refresh data', error);
      throw new Error(
        error instanceof Error
          ? `Impossible de rafraîchir les données : ${error.message}`
          : 'Impossible de rafraîchir les données.'
      );
    } finally {
      setIsDataLoading(false);
    }
  }, [ensureSession, session]);

  // Silent refresh that doesn't show loading indicator
  const refreshDataSilent = useCallback(async () => {
    if (!ensureSession()) {
      return;
    }
    try {
      const data = await dataService.loadData(session!.user.id);
      setJobs(data.jobs);
      setExpenses(data.expenses);
      const nextCategories = data.categories.length ? data.categories : DEFAULT_CATEGORIES;
      setCategories(nextCategories);
      setNotifications(data.notifications);
      setSelectedJob((prev) => {
        if (!prev) {
          return prev;
        }
        const updated = data.jobs.find((job) => job.id === prev.id);
        return updated ?? prev;
      });
    } catch (error) {
      console.error('Failed to refresh data silently', error);
      // Don't throw - fail silently
    }
  }, [ensureSession, session]);

  const addJob = useCallback(
    async (job: Job) => {
      if (!ensureSession()) return;
      try {
        const inserted = await financialService.createJob(job);
        setJobs((prev) => [inserted, ...prev]);
        const newNotification: Notification = {
          id: `notif-${Date.now()}`,
          message: `Nouveau contrat créé: ${inserted.name}`,
          type: 'success',
          timestamp: new Date().toISOString(),
          read: false,
          jobId: inserted.id,
        };
        setNotifications((prev) => [newNotification, ...prev]);
        await dataService.upsertNotifications([newNotification], session!.user.id);
        showToast('Contrat ajouté avec succès!');
      } catch (error) {
        console.error('Failed to create job', error);
        showToast("Impossible d'ajouter le contrat.");
        throw error instanceof Error ? error : new Error("Impossible d'ajouter le contrat.");
      }
    },
    [ensureSession, session, showToast]
  );

  const addExpense = useCallback(
    async (expenseData: Omit<Expense, 'id'>) => {
      if (!ensureSession()) return;
      const uniqueId = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const newExpense: Expense = {
        id: uniqueId,
        ...expenseData,
      };
      try {
        const updatedJob = await financialService.createExpense({ ...newExpense });
        setExpenses((prev) => [newExpense, ...prev]);
        if (updatedJob) {
          setJobs((prev) => prev.map((job) => (job.id === updatedJob.id ? updatedJob : job)));
          setSelectedJob((prev) => (prev?.id === updatedJob.id ? updatedJob : prev));
        }
        const newNotification: Notification = {
          id: `notif-${Date.now()}`,
          message: `Dépense ajoutée: ${newExpense.name} - ${newExpense.amount.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}`,
          type: 'info',
          timestamp: new Date().toISOString(),
          read: false,
          jobId: newExpense.jobId,
        };
        setNotifications((prev) => [newNotification, ...prev]);
        await dataService.upsertNotifications([newNotification], session!.user.id);
        showToast('Dépense ajoutée avec succès!');
      } catch (error) {
        console.error('Failed to create expense', error);
        showToast("Impossible d'ajouter la dépense.");
        throw error instanceof Error ? error : new Error("Impossible d'ajouter la dépense.");
      }
    },
    [ensureSession, session, showToast]
  );

  const updateExpense = useCallback(
    async (expenseToUpdate: Expense) => {
      if (!ensureSession()) return;
      const existingExpense = expenses.find((expense) => expense.id === expenseToUpdate.id);
      if (!existingExpense) {
        showToast('Dépense introuvable!');
        return;
      }

      try {
        const { updatedExpense, updatedJobs } = await financialService.updateExpense(expenseToUpdate);
        const normalizedExpense: Expense = updatedExpense
          ? {
              ...updatedExpense,
              receiptImage: expenseToUpdate.receiptImage ?? existingExpense.receiptImage,
            }
          : {
              ...existingExpense,
              ...expenseToUpdate,
            };

        setExpenses((prev) =>
          prev.map((expense) => (expense.id === normalizedExpense.id ? normalizedExpense : expense))
        );

        const jobsToApply = updatedJobs ?? [];
        if (jobsToApply.length) {
          setJobs((prev) => {
            const jobMap = new Map(jobsToApply.map((job) => [job.id, job]));
            const existingIds = new Set(prev.map((job) => job.id));
            let next = prev.map((job) => jobMap.get(job.id) ?? job);
            const additions = jobsToApply.filter((job) => !existingIds.has(job.id));
            if (additions.length) {
              next = [...additions, ...next];
            }
            return next;
          });

          setSelectedJob((prev) => {
            if (!prev) {
              return prev;
            }
            const match = jobsToApply.find((job) => job.id === prev.id);
            return match ?? prev;
          });
        }

        showToast('Dépense mise à jour!');
      } catch (error) {
        console.error('Failed to update expense', error);
        showToast("Impossible de mettre à jour la dépense.");
        throw error instanceof Error ? error : new Error("Impossible de mettre à jour la dépense.");
      }
    },
    [ensureSession, expenses, showToast]
  );

  const updateJob = useCallback(
    async (jobToUpdate: Partial<Job> & { id: string }) => {
      if (!ensureSession()) return;
      try {
        const updated = await financialService.updateJob(jobToUpdate);
        setJobs((prev) => prev.map((job) => (job.id === updated.id ? updated : job)));
        setSelectedJob((prev) => (prev?.id === updated.id ? updated : prev));
      } catch (error) {
        console.error('Failed to update job', error);
        showToast("Impossible de mettre à jour le contrat.");
        throw error instanceof Error ? error : new Error("Impossible de mettre à jour le contrat.");
      }
    },
    [ensureSession, showToast]
  );

  const handleDeleteReceiptFromExpense = useCallback(
    async (expense: Expense) => {
      if (!ensureSession()) return;
      
      try {
        // Delete receipt from storage if it's a URL
        if (expense.receiptImage && (expense.receiptImage.startsWith('http') || expense.receiptImage.startsWith('/'))) {
          const { receiptService } = await import('./services/receiptService');
          await receiptService.deleteReceipt(expense.receiptImage);
        }
        
        // Update expense to remove receipt image
        const updatedExpense = {
          ...expense,
          receiptImage: undefined,
        };
        await updateExpense(updatedExpense);
        showToast('Reçu supprimé avec succès!');
      } catch (error) {
        console.error('Failed to delete receipt from expense:', error);
        showToast("Impossible de supprimer le reçu.");
      }
    },
    [ensureSession, updateExpense, showToast]
  );

  const handleDeleteExpense = useCallback(
    async (expenseId: string, _expenseName: string) => {
      if (!ensureSession()) return;
      
      console.log('=== DELETE EXPENSE DEBUG ===');
      console.log('expenseId:', expenseId, 'type:', typeof expenseId);
      console.log('All expenses:', expenses.map(e => ({ id: e.id, name: e.name })));
      
      // Find the expense to delete
      const expenseToDelete = expenses.find((exp) => String(exp.id) === String(expenseId));
      if (!expenseToDelete) {
        console.error('Expense not found in list:', expenseId);
        showToast('Dépense introuvable!');
        return;
      }
      
      console.log('Found expense to delete:', {
        id: expenseToDelete.id,
        name: expenseToDelete.name,
        jobId: expenseToDelete.jobId,
      });
      
      // Delete receipt from storage if it exists
      if (expenseToDelete.receiptImage && (expenseToDelete.receiptImage.startsWith('http') || expenseToDelete.receiptImage.startsWith('/'))) {
        try {
          const { receiptService } = await import('./services/receiptService');
          await receiptService.deleteReceipt(expenseToDelete.receiptImage);
        } catch (error) {
          console.error('Failed to delete receipt when deleting expense:', error);
          // Continue with expense deletion even if receipt deletion fails
        }
      }
      
      // Optimistic update: remove expense from UI immediately
      const previousExpenses = expenses;
      setExpenses((prev) => prev.filter((exp) => String(exp.id) !== String(expenseId)));
      
      try {
        // Call backend to delete
        console.log('Calling backend deleteExpense with ID:', expenseId);
        const updatedJob = await financialService.deleteExpense(expenseId);
        
        // Update job financials if expense was attached to a job
        if (updatedJob) {
          setJobs((prev) => prev.map((job) => (job.id === updatedJob.id ? updatedJob : job)));
          setSelectedJob((prev) => (prev?.id === updatedJob.id ? updatedJob : prev));
        }
        
        showToast('Dépense supprimée avec succès!');
      } catch (error) {
        // Rollback optimistic update on error
        console.error('Failed to delete expense:', error);
        setExpenses(previousExpenses);
        
        const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
        showToast(`Impossible de supprimer la dépense: ${errorMessage}`);
        
        // DON'T throw - this prevents the error from bubbling up and causing navigation issues
        // Just log it and let the user try again
      }
    },
    [ensureSession, expenses, showToast]
  );

  const handleDeleteJob = useCallback(
    async (jobId: string, _jobName: string) => {
      if (!ensureSession()) return;
      
      // Find the job to delete
      const jobToDelete = jobs.find((job) => job.id === jobId);
      if (!jobToDelete) {
        console.error('Job not found:', jobId);
        showToast('Contrat introuvable!');
        return;
      }
      
      // Optimistic update: remove job and associated expenses from UI immediately
      const previousJobs = jobs;
      const previousExpenses = expenses;
      
      setJobs((prev) => prev.filter((job) => job.id !== jobId));
      setExpenses((prev) => prev.filter((expense) => expense.jobId !== jobId));
      
      // Clear selected job if it's being deleted
      if (selectedJob?.id === jobId) {
        setSelectedJob(null);
        setScreen('jobs');
      }
      
      try {
        // Call backend to delete (cascades to expenses automatically)
        await financialService.deleteJob(jobId);
        showToast('Contrat supprimé avec succès!');
      } catch (error) {
        // Rollback optimistic updates on error
        console.error('Failed to delete job:', error);
        setJobs(previousJobs);
        setExpenses(previousExpenses);
        
        // Restore selected job if it was cleared
        if (jobToDelete && selectedJob?.id === jobId) {
          setSelectedJob(jobToDelete);
        }
        
        const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
        showToast(`Impossible de supprimer le contrat: ${errorMessage}`);
        
        // DON'T throw - this prevents the error from bubbling up and causing navigation issues
        // Just log it and let the user try again
      }
    },
    [ensureSession, jobs, expenses, selectedJob, showToast]
  );

  const handleSelectJob = useCallback((job: Job) => {
    setSelectedJob(job);
    setScreen('jobDetail');
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedJob(null);
    setScreen('jobs');
  }, []);

  const handleMarkNotificationAsRead = useCallback(
    async (notificationId: string) => {
      let previousNotifications: Notification[] | null = null;
      setNotifications((prev) => {
        previousNotifications = prev;
        return prev.map((notif) => (notif.id === notificationId ? { ...notif, read: true } : notif));
      });
      if (session) {
        try {
          await dataService.setNotificationRead(notificationId, true);
        } catch (error) {
          console.error('Failed to update notification', error);
          if (previousNotifications) {
            setNotifications(previousNotifications);
          }
          throw error instanceof Error ? error : new Error("Impossible de mettre à jour la notification.");
        }
      }
    },
    [session]
  );

  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      if (notification.jobId) {
        const job = jobs.find((j) => j.id === notification.jobId);
        if (job) {
          handleSelectJob(job);
        }
      }
    },
    [jobs, handleSelectJob]
  );

  const handleDeleteNotification = useCallback(
    async (notificationId: string) => {
      let previousNotifications: Notification[] | null = null;
      setNotifications((prev) => {
        previousNotifications = prev;
        return prev.filter((notif) => notif.id !== notificationId);
      });
      if (session) {
        try {
          await dataService.deleteNotification(notificationId);
        } catch (error) {
          console.error('Failed to delete notification', error);
          if (previousNotifications) {
            setNotifications(previousNotifications);
          }
          throw error instanceof Error ? error : new Error("Impossible de supprimer la notification.");
        }
      }
    },
    [session]
  );

  const handleRenameNotification = useCallback(
    async (notificationId: string, newTitle: string) => {
      let previousNotifications: Notification[] | null = null;
      setNotifications((prev) => {
        previousNotifications = prev;
        return prev.map((notif) => (notif.id === notificationId ? { ...notif, message: newTitle } : notif));
      });
      if (session) {
        try {
          await dataService.renameNotification(notificationId, newTitle);
        } catch (error) {
          console.error('Failed to rename notification', error);
          if (previousNotifications) {
            setNotifications(previousNotifications);
          }
          throw error instanceof Error ? error : new Error("Impossible de renommer la notification.");
        }
      }
    },
    [session]
  );

  const createNotificationFromAI = useCallback(
    async ({ message, type, jobId }: { message: string; type?: Notification['type']; jobId?: string }) => {
      const trimmedMessage = message.trim();
      if (!trimmedMessage) {
        return;
      }
      const allowedTypes: Notification['type'][] = ['info', 'warning', 'success', 'error'];
      const resolvedType = type && allowedTypes.includes(type) ? type : 'info';
      const notification: Notification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        message: trimmedMessage,
        type: resolvedType,
        timestamp: new Date().toISOString(),
        read: false,
        jobId: jobId ?? undefined,
      };
      setNotifications((prev) => [notification, ...prev]);
      if (!ensureSession()) {
        return;
      }
      try {
        await dataService.upsertNotifications([notification], session!.user.id);
      } catch (error) {
        console.error('Failed to persist AI notification', error);
        throw error instanceof Error ? error : new Error('Impossible de créer la notification.');
      }
    },
    [ensureSession, session]
  );

  const markNotificationFromAI = useCallback(
    async ({ notificationId, notificationMessage }: { notificationId?: string; notificationMessage?: string }) => {
      const idCandidate = notificationId?.trim();
      const messageCandidate = notificationMessage?.trim().toLowerCase();
      let target = idCandidate ? notifications.find((notification) => notification.id === idCandidate) : undefined;
      if (!target && messageCandidate) {
        target =
          notifications.find((notification) => notification.message.toLowerCase() === messageCandidate) ??
          notifications.find((notification) =>
            notification.message.toLowerCase().includes(messageCandidate)
          );
      }
      if (!target) {
        console.warn('Notification introuvable pour marquage AI', { notificationId, notificationMessage });
        return;
      }
      await handleMarkNotificationAsRead(target.id);
    },
    [handleMarkNotificationAsRead, notifications]
  );

  const deleteNotificationFromAI = useCallback(
    async ({ notificationId, notificationMessage }: { notificationId?: string; notificationMessage?: string }) => {
      const idCandidate = notificationId?.trim();
      const messageCandidate = notificationMessage?.trim().toLowerCase();
      let target = idCandidate ? notifications.find((notification) => notification.id === idCandidate) : undefined;
      if (!target && messageCandidate) {
        target =
          notifications.find((notification) => notification.message.toLowerCase() === messageCandidate) ??
          notifications.find((notification) =>
            notification.message.toLowerCase().includes(messageCandidate)
          );
      }
      if (!target) {
        console.warn('Notification introuvable pour suppression AI', { notificationId, notificationMessage });
        return;
      }
      await handleDeleteNotification(target.id);
    },
    [handleDeleteNotification, notifications]
  );

  const handleOnboardingComplete = useCallback(
    async (profile: Partial<UserProfile>) => {
      if (!ensureSession()) return;
      const nextProfile: UserProfile = {
        name: profile.name || userProfile.name || '',
        email: profile.email ?? userProfile.email,
        companyName: profile.companyName ?? userProfile.companyName,
        taxRate: profile.taxRate ?? userProfile.taxRate,
      };
      setUserProfile(nextProfile);
      try {
        await dataService.upsertProfile(session!.user.id, nextProfile);
        setIsOnboarding(false);
        showToast('Profil enregistré!');
      } catch (error) {
        console.error('Failed to save onboarding profile', error);
        showToast("Impossible d'enregistrer votre profil.");
      }
    },
    [ensureSession, session, showToast, userProfile]
  );

  const handleProfileUpdate = useCallback(
    async (profile: UserProfile) => {
      if (!ensureSession()) return;
      setUserProfile(profile);
      try {
        await dataService.upsertProfile(session!.user.id, profile);
      } catch (error) {
        console.error('Failed to update profile', error);
        showToast("Impossible d'enregistrer votre profil.");
      }
    },
    [ensureSession, session, showToast]
  );

  const handleProfileSaved = useCallback(async () => {
    showToast('Paramètres enregistrés!');
  }, [showToast]);

  const handlePasswordResetComplete = useCallback(async () => {
    setIsPasswordResetMode(false);
    setAuthMode('signin');
    showToast('Mot de passe réinitialisé avec succès. Veuillez vous connecter.');
  }, [showToast]);

  const handlePasswordResetCancel = useCallback(() => {
    setIsPasswordResetMode(false);
    setAuthMode('signin');
  }, []);

  if (isPasswordResetMode) {
    return (
      <>
        <ResetPasswordScreen 
          onPasswordReset={handlePasswordResetComplete}
          onCancel={handlePasswordResetCancel}
        />
        <Toast message={toastMessage} isVisible={isToastVisible} />
      </>
    );
  }

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fiscalia-primary-dark text-white">
        <p className="text-lg font-medium">Chargement...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <AuthScreen
          mode={authMode}
          onModeChange={setAuthMode}
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
          onForgotPassword={handleForgotPassword}
          isLoading={isAuthLoading}
          error={authError}
        />
        <Toast message={toastMessage} isVisible={isToastVisible} />
      </>
    );
  }

  if (isOnboarding) {
    return (
      <>
        <OnboardingScreen onComplete={handleOnboardingComplete} isSubmitting={isDataLoading} />
        <Toast message={toastMessage} isVisible={isToastVisible} />
      </>
    );
  }

  const renderScreen = () => {
    switch (screen) {
      case 'dashboard':
        return <DashboardScreen jobs={jobs} expenses={expenses} categories={categories} />;
      case 'jobs':
        return (
          <JobsScreen
            jobs={jobs}
            onSelectJob={handleSelectJob}
            onAddJob={() => setAddJobModalOpen(true)}
            onDeleteJob={handleDeleteJob}
            onUpdateJob={updateJob}
          />
        );
      case 'jobDetail':
        return (
          selectedJob && (
            <JobDetailScreen
              job={selectedJob}
              expenses={expenses}
              onBack={handleBackToList}
              onAddExpense={() => openCreateExpenseModal(selectedJob?.id)}
              onEditExpense={openEditExpenseModal}
              onDeleteExpense={handleDeleteExpense}
              onDeleteJob={handleDeleteJob}
              onUpdateJob={updateJob}
            />
          )
        );
      case 'expenses':
        return (
          <ExpensesScreen
            expenses={expenses}
            jobs={jobs}
            categories={categories}
            onAddExpense={() => openCreateExpenseModal()}
            onManageCategories={() => setManageCategoriesModalOpen(true)}
            onEditExpense={openEditExpenseModal}
            onDeleteExpense={handleDeleteExpense}
            onDeleteReceipt={handleDeleteReceiptFromExpense}
          />
        );
      case 'assistant':
        return (
          <ChatScreen
            conversation={activeConversation}
            messages={activeMessages}
            onMessagesChange={handleConversationMessagesUpdate}
            onStartNewConversation={handleStartConversation}
            onFirstUserMessage={handleFirstUserMessage}
            jobs={jobs}
            expenses={expenses}
            categories={categories}
            addJob={addJob}
            addExpense={addExpense}
            updateExpense={updateExpense}
            updateJob={updateJob}
            deleteJob={handleDeleteJob}
            deleteExpense={handleDeleteExpense}
            createCategory={addCategory}
            renameCategory={renameCategory}
            deleteCategory={deleteCategory}
            createNotification={createNotificationFromAI}
            markNotificationRead={markNotificationFromAI}
            deleteNotification={deleteNotificationFromAI}
            registerPendingOperation={registerPendingChatOperation}
            onRequireRefresh={refreshDataSilent}
          />
        );
      case 'reports':
        return <ReportsScreen />;
      case 'settings':
        return (
          <SettingsScreen userProfile={userProfile} onUpdateProfile={handleProfileUpdate} onSave={handleProfileSaved} />
        );
      default:
        return <DashboardScreen jobs={jobs} expenses={expenses} categories={categories} />;
    }
  };

  const MainContent = () => (
    <main className={`flex-1 ${screen === 'settings' ? 'overflow-hidden h-full flex flex-col' : 'p-4 sm:p-6 lg:p-8 overflow-y-auto'}`}>
      <div className={`${screen === 'settings' ? 'flex-1 overflow-hidden h-full' : 'w-full max-w-7xl mx-auto'}`}>
        {renderScreen()}
      </div>
    </main>
  );

  if (isMobile) {
    return (
      <div className="relative h-screen flex flex-col bg-fiscalia-light-neutral">
        <AddJobModal isOpen={isAddJobModalOpen} onClose={() => setAddJobModalOpen(false)} onAddJob={addJob} />
        <AddExpenseModal
          isOpen={isAddExpenseModalOpen}
          onClose={closeExpenseModal}
          onAddExpense={addExpense}
          onUpdateExpense={updateExpense}
          jobs={jobs}
          categories={categories}
          initialJobId={expenseModalJobId}
          mode={expenseModalMode}
          initialExpense={expenseToEdit}
        />
        <ManageCategoriesModal
          isOpen={isManageCategoriesModalOpen}
          onClose={() => setManageCategoriesModalOpen(false)}
          categories={categories}
          onAddCategory={addCategory}
        onDeleteCategory={deleteCategory}
        />
        <Toast message={toastMessage} isVisible={isToastVisible} />
        <div className="flex-1 overflow-y-auto pb-20">{renderScreen()}</div>
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-fiscalia-primary-dark/10 flex justify-around">
          {NAVIGATION_ITEMS.map((item) => (
            <button
              key={item.screen}
              type="button"
              onClick={() => setScreen(item.screen)}
              className={`flex flex-col items-center justify-center p-3 w-full transition-colors ${
                screen === item.screen ? 'text-fiscalia-accent-gold' : 'text-fiscalia-primary-dark/60'
              }`}
            >
              <item.icon className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">{item.name}</span>
            </button>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-fiscalia-light-neutral">
      <AddJobModal isOpen={isAddJobModalOpen} onClose={() => setAddJobModalOpen(false)} onAddJob={addJob} />
      <AddExpenseModal
        isOpen={isAddExpenseModalOpen}
        onClose={closeExpenseModal}
        onAddExpense={addExpense}
        onUpdateExpense={updateExpense}
        jobs={jobs}
        categories={categories}
        initialJobId={expenseModalJobId}
        mode={expenseModalMode}
        initialExpense={expenseToEdit}
      />
      <ManageCategoriesModal
        isOpen={isManageCategoriesModalOpen}
        onClose={() => setManageCategoriesModalOpen(false)}
        categories={categories}
        onAddCategory={addCategory}
        onDeleteCategory={deleteCategory}
      />
      <Toast message={toastMessage} isVisible={isToastVisible} />

      <aside className="w-64 bg-fiscalia-primary-dark flex flex-col flex-shrink-0 h-screen border-r border-white/10">
        <div className="flex items-center justify-between p-3 flex-shrink-0 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <Logo className="w-6 h-6 text-fiscalia-accent-gold flex-shrink-0" />
            <h1 className="text-lg font-semibold text-white font-display tracking-tight">Fiscalia</h1>
          </div>
        </div>

        <div className="p-2 flex-shrink-0 border-b border-white/10">
          <button
            type="button"
            onClick={() => {
              void handleStartConversation();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-white/70 hover:bg-white/10 hover:text-white transition-colors group"
          >
            <PlusIcon className="w-4 h-4" />
            <span className="text-sm font-medium">Nouvelle conversation</span>
          </button>
        </div>

        <div className="px-2 py-2 flex-shrink-0 border-b border-white/10">
          <div className="space-y-0.5">
            {DESKTOP_NAVIGATION_ITEMS.filter((item) => item.screen !== 'assistant').map((item) => (
              <button
                key={item.screen}
                type="button"
                onClick={() => setScreen(item.screen)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-left transition-colors ${
                  screen === item.screen ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm flex-1">{item.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden">
            <SidebarConversationHistory
              conversations={conversations}
              activeConversationId={activeConversation?.id}
              onConversationSelect={handleSelectConversation}
              onConversationRename={handleRenameConversation}
              onConversationDelete={handleDeleteConversation}
            />
          </div>
          <div className="flex-1 min-h-0 overflow-hidden border-t border-white/10">
            <SidebarNotifications
              notifications={[...notifications].sort(
                (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
              )}
              onNotificationClick={handleNotificationClick}
              onMarkAsRead={handleMarkNotificationAsRead}
              onDeleteNotification={handleDeleteNotification}
              onRenameNotification={handleRenameNotification}
            />
          </div>
        </div>

        <div className="relative p-2 border-t border-white/10 flex-shrink-0" ref={accountMenuRef}>
          <button
            type="button"
            onClick={handleAccountButtonClick}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-white/5 transition-colors group"
          >
            <div className="w-8 h-8 rounded-full bg-fiscalia-accent-gold flex items-center justify-center text-fiscalia-primary-dark font-semibold text-xs flex-shrink-0">
              {userProfile.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm text-white font-medium truncate">{userProfile.name || 'Profil'}</p>
              <p className="text-xs text-white/60 truncate">{userProfile.email || 'Profil à compléter'}</p>
            </div>
          </button>
          {isAccountMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-white/10 bg-fiscalia-primary-dark shadow-xl">
              <div className="py-1">
                <button
                  type="button"
                  onClick={handleAccountMenuNavigateToSettings}
                  className="w-full px-3 py-2 text-left text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                >
                  Paramètres
                </button>
                <button
                  type="button"
                  onClick={handleAccountMenuSignOut}
                  className="w-full px-3 py-2 text-left text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                >
                  Se déconnecter
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 flex min-w-0 relative">
        {screen !== 'assistant' && <MainContent />}
        {screen !== 'settings' && (
          <div className={`transition-all duration-500 ease-in-out flex-shrink-0 ${screen === 'assistant' ? 'w-full' : 'w-96'}`}>
            <div className="p-6 h-full">
              <ChatScreen
                conversation={activeConversation}
                messages={activeMessages}
                onMessagesChange={handleConversationMessagesUpdate}
                onStartNewConversation={handleStartConversation}
                onFirstUserMessage={handleFirstUserMessage}
                jobs={jobs}
                expenses={expenses}
                categories={categories}
                addJob={addJob}
                addExpense={addExpense}
                updateExpense={updateExpense}
                updateJob={updateJob}
                deleteJob={handleDeleteJob}
                deleteExpense={handleDeleteExpense}
                createCategory={addCategory}
                renameCategory={renameCategory}
                deleteCategory={deleteCategory}
                createNotification={createNotificationFromAI}
                markNotificationRead={markNotificationFromAI}
                deleteNotification={deleteNotificationFromAI}
                registerPendingOperation={registerPendingChatOperation}
                focusAssistantOnNewConversation={false}
                onRequireRefresh={refreshDataSilent}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
