import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatScreen } from '../../components';
import type {
  ChatMessage,
  Conversation,
  Job,
  Expense,
  ExpenseCategory,
  Notification,
  ActionExecutionResult,
} from '../../types';

vi.mock('../../services/aiService', () => ({
  aiService: {
    sendMessage: vi.fn(),
  },
}));

vi.mock('../../services/actionService', () => ({
  actionService: {
    execute: vi.fn(),
  },
}));

vi.mock('../../services/speechService', () => ({
  speechService: {
    isSupported: () => false,
    startListening: vi.fn(),
    stopListening: vi.fn(),
  },
}));

const { aiService } = await import('../../services/aiService');
const { actionService } = await import('../../services/actionService');

const baseConversation: Conversation = {
  id: 'conv-1',
  title: 'Nouvelle conversation',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  hasUserMessage: false,
  memorySummary: 'Mémoire de test',
};

const baseMessages: ChatMessage[] = [
  {
    id: 'msg-ai-1',
    conversationId: 'conv-1',
    sender: 'ai',
    text: 'Bonjour! Je suis Fiscalia.',
    timestamp: new Date().toISOString(),
  },
];

const noopAsync = vi.fn(async () => undefined);
const refreshMock = vi.fn(async () => undefined);

const TestChatScreen: React.FC = () => {
  const [messages, setMessages] = React.useState<ChatMessage[]>(baseMessages);
  const jobs: Job[] = [];
  const expenses: Expense[] = [];
  const categories: ExpenseCategory[] = ['Autre'];

  const handleMessagesChange = (conversationId: string, updater: React.SetStateAction<ChatMessage[]>) => {
    setMessages((prev) => {
      if (conversationId !== baseConversation.id) {
        return prev;
      }
      return typeof updater === 'function' ? (updater as (value: ChatMessage[]) => ChatMessage[])(prev) : updater;
    });
  };

  return (
    <ChatScreen
      conversation={baseConversation}
      messages={messages}
      onMessagesChange={handleMessagesChange}
      onStartNewConversation={async () => baseConversation.id}
      onFirstUserMessage={async () => undefined}
      jobs={jobs}
      expenses={expenses}
      categories={categories}
      addJob={noopAsync}
      addExpense={noopAsync}
      updateExpense={noopAsync}
      updateJob={noopAsync}
      deleteJob={noopAsync}
      deleteExpense={noopAsync}
      createCategory={noopAsync}
      renameCategory={noopAsync}
      deleteCategory={noopAsync}
      createNotification={noopAsync}
      markNotificationRead={noopAsync}
      deleteNotification={noopAsync}
      registerPendingOperation={() => undefined}
      focusAssistantOnNewConversation={true}
      onRequireRefresh={refreshMock}
    />
  );
};

describe('ChatScreen AI integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    refreshMock.mockClear();
  });

  it('sends message through aiService and executes returned actions', async () => {
    vi.mocked(aiService.sendMessage).mockResolvedValue({
      text: 'Contrat créé',
      actions: [
        {
          action: 'create_job',
          data: { name: 'Nouveau contrat', revenue: 1000 },
        },
      ],
    });

    vi.mocked(actionService.execute).mockResolvedValue({
      mutated: true,
      log: [],
    } as ActionExecutionResult);

    render(<TestChatScreen />);

    const input = screen.getByPlaceholderText('Posez votre question à Fiscalia...');
    fireEvent.change(input, { target: { value: 'Crée un contrat à 1000$' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

    await waitFor(() => {
      expect(aiService.sendMessage).toHaveBeenCalledTimes(1);
    });

    expect(aiService.sendMessage).toHaveBeenCalledWith(
      'Crée un contrat à 1000$',
      expect.any(Array),
      expect.objectContaining({
        conversationId: baseConversation.id,
        conversationMemory: baseConversation.memorySummary,
      }),
    );

    await waitFor(() => {
      expect(actionService.execute).toHaveBeenCalledWith([
        {
          action: 'create_job',
          data: { name: 'Nouveau contrat', revenue: 1000 },
        },
      ]);
    });

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText('Contrat créé')).toBeInTheDocument();
    });
  });
});

