export enum JobStatus {
  InProgress = 'En cours',
  Completed = 'Terminé',
  Paid = 'Payé',
}

export type ExpenseCategory = string;

export interface Job {
  id: string;
  name: string;
  clientName?: string;
  address?: string;
  description?: string;
  status: JobStatus;
  revenue: number;
  expenses: number;
  profit: number;
  startDate: string;
  endDate: string;
}

export interface Expense {
  id:string;
  name: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
  jobId?: string | null;
  receiptImage?: string; // Storing as base64 data URL
  vendor?: string;
  notes?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  hasUserMessage: boolean;
  lastMessagePreview?: string;
  lastMessageAt?: string;
  memorySummary?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  jobSummary?: Job;
  customTitle?: string;
}

export type Screen = 'onboarding' | 'assistant' | 'jobs' | 'jobDetail' | 'expenses' | 'dashboard' | 'reports' | 'settings';

export type CreateJobAction = {
  action: 'create_job';
  data: {
    jobId?: string;
    name: string;
    revenue: number | string;
    amount?: number | string;
    status?: JobStatus;
    clientName?: string;
    address?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
  };
  confirmationMessage?: string;
};

export type UpdateJobAction = {
  action: 'update_job';
  data: {
    jobId?: string;
    jobName?: string;
    updates: Partial<{
      name: string;
      clientName: string;
      address: string;
      description: string;
      status: JobStatus;
      startDate: string;
      endDate: string;
      revenue: number;
      expenses: number;
      profit: number;
    }>;
  };
  confirmationMessage?: string;
};

export type UpdateJobStatusAction = {
  action: 'update_job_status';
  data: {
    jobId?: string;
    jobName?: string;
    status: JobStatus | string;
  };
  confirmationMessage?: string;
};

export type DeleteJobAction = {
  action: 'delete_job';
  data: {
    jobId?: string;
    jobName?: string;
  };
  confirmationMessage?: string;
};

export type CreateExpenseAction = {
  action: 'create_expense';
  data: {
    name: string;
    amount: number;
    category: ExpenseCategory;
    date?: string;
    jobId?: string | null;
    jobName?: string;
    vendor?: string;
    notes?: string;
    receiptImage?: string;
  };
  confirmationMessage?: string;
};

export type UpdateExpenseAction = {
  action: 'update_expense';
  data: {
    expenseId?: string;
    expenseName?: string;
    updates: Partial<{
      name: string;
      amount: number;
      category: ExpenseCategory;
      date: string;
      jobId: string | null;
      vendor: string;
      notes: string;
      receiptImage: string;
    }>;
  };
  confirmationMessage?: string;
};

export type DeleteExpenseAction = {
  action: 'delete_expense';
  data: {
    expenseId?: string;
    expenseName?: string;
  };
  confirmationMessage?: string;
};

export type AttachExpenseAction = {
  action: 'attach_expense';
  data: {
    expenseId?: string;
    expenseName?: string;
    jobId?: string;
    jobName?: string;
  };
  confirmationMessage?: string;
};

export type DetachExpenseAction = {
  action: 'detach_expense';
  data: {
    expenseId?: string;
    expenseName?: string;
  };
  confirmationMessage?: string;
};

export type CreateCategoryAction = {
  action: 'create_category';
  data: {
    name: string;
  };
  confirmationMessage?: string;
};

export type RenameCategoryAction = {
  action: 'rename_category';
  data: {
    categoryName: string;
    nextName: string;
  };
  confirmationMessage?: string;
};

export type DeleteCategoryAction = {
  action: 'delete_category';
  data: {
    categoryName: string;
  };
  confirmationMessage?: string;
};

export type CreateNotificationAction = {
  action: 'create_notification';
  data: {
    message: string;
    type?: Notification['type'];
    jobId?: string;
  };
  confirmationMessage?: string;
};

export type MarkNotificationReadAction = {
  action: 'mark_notification_read';
  data: {
    notificationId?: string;
    notificationMessage?: string;
  };
  confirmationMessage?: string;
};

export type DeleteNotificationAction = {
  action: 'delete_notification';
  data: {
    notificationId?: string;
    notificationMessage?: string;
  };
  confirmationMessage?: string;
};

export type QueryAction = {
  action: 'query';
  data: {
    topic?: string;
    filters?: Record<string, unknown>;
    summary?: string;
  };
  confirmationMessage?: string;
};

export type LegacyAction = {
  action: 'create_contract' | 'update_job_status';
  data: Record<string, unknown>;
  confirmationMessage?: string;
};

export type AIAction =
  | CreateJobAction
  | UpdateJobAction
  | UpdateJobStatusAction
  | DeleteJobAction
  | CreateExpenseAction
  | UpdateExpenseAction
  | DeleteExpenseAction
  | AttachExpenseAction
  | DetachExpenseAction
  | CreateCategoryAction
  | RenameCategoryAction
  | DeleteCategoryAction
  | CreateNotificationAction
  | MarkNotificationReadAction
  | DeleteNotificationAction
  | QueryAction
  | LegacyAction;

export interface AIResponse {
  text: string;
  actions?: AIAction[];
}

export type ActionExecutionStatus = 'success' | 'failed';

export interface ActionExecutionLogEntry {
  action: string;
  status: ActionExecutionStatus;
  detail?: string;
  payload?: unknown;
  elapsedMs: number;
}

export interface ActionExecutionResult {
  mutated: boolean;
  log: ActionExecutionLogEntry[];
}

export interface UserProfile {
  name: string;
  email?: string;
  companyName?: string;
  taxRate?: number;
}

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  timestamp: string;
  read: boolean;
  jobId?: string;
}