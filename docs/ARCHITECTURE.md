# Fiscalia Architecture

This document describes the system architecture, design decisions, and technical details of the Fiscalia application.

## Overview

Fiscalia is a client-server application with an AI-powered conversational interface. The frontend is a React SPA, and the backend consists of Supabase Edge Functions and PostgreSQL database.

## System Architecture

```
┌─────────────────┐
│   React SPA     │
│  (Frontend)     │
└────────┬────────┘
         │
         │ HTTPS/REST
         │
┌────────▼─────────────────────────────────┐
│          Supabase                        │
│  ┌───────────────────────────────────┐  │
│  │  Edge Functions                   │  │
│  │  • ai-proxy (AI chat)             │  │
│  │  • ai-actions (CRUD execution)    │  │
│  │  • financial-sync (calculations)  │  │
│  │  • conversation-memory (context)  │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │  PostgreSQL Database              │  │
│  │  • jobs, expenses, profiles       │  │
│  │  • conversations, messages        │  │
│  │  • categories, notifications      │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
         │
         │ HTTP
         │
┌────────▼────────┐
│  LM Studio /    │
│  OpenRouter     │
│  (AI Models)    │
└─────────────────┘
```

## Frontend Architecture

### Component Structure

- **App.tsx**: Main application component with routing and state management
- **components/**: Screen components (Dashboard, Jobs, Expenses, Chat, etc.)
- **services/**: Business logic layer
  - `authService.ts`: Authentication
  - `dataService.ts`: CRUD operations
  - `aiService.ts`: AI chat interface
  - `financialService.ts`: Financial calculations
  - `supabaseClient.ts`: Supabase client initialization

### State Management

- React hooks (`useState`, `useEffect`, `useCallback`, `useMemo`)
- Local state for UI components
- Supabase real-time subscriptions for data updates
- Optimistic updates for instant UI feedback

### Data Flow

1. User interacts with UI
2. Service layer makes API calls to Supabase
3. Edge Functions process requests (if needed)
4. Database updates
5. Real-time subscriptions notify frontend
6. UI updates optimistically and confirms

## Backend Architecture

### Supabase Edge Functions

#### `ai-proxy`
- Handles AI chat requests
- Integrates with LM Studio or OpenRouter
- Returns natural language responses and proposed actions
- Tracks metrics and logs

#### `ai-actions`
- Executes CRUD operations atomically
- Validates actions before execution
- Rollback on failure
- Transactional guarantees

#### `financial-sync`
- Calculates profit for jobs
- Server-side financial calculations
- Updates job financials when expenses change

#### `conversation-memory`
- Manages conversation context
- Stores and retrieves conversation summaries
- Enables long-term memory across sessions

### Database Schema

#### Core Tables

- **profiles**: User profile information
- **jobs**: Projects/contracts with financial data
- **expenses**: Expense records linked to jobs
- **categories**: Custom expense categories
- **conversations**: Chat conversation metadata
- **notifications**: User notifications

#### Security

- Row Level Security (RLS) policies ensure users only access their own data
- Service role key used only in Edge Functions
- Anon key used in frontend with RLS protection

## AI Integration

### Model Configuration

- **Default**: LM Studio with `google/gemma-3-12b` (local)
- **Fallback**: OpenRouter with `nvidia/nemotron-nano-9b-v2:free` (cloud)
- Configurable via environment variables

### AI Workflow

1. User sends message in French
2. Frontend calls `ai-proxy` Edge Function
3. Function builds context from:
   - Conversation history (last 60 messages)
   - User's financial data
   - Conversation memory summary
4. AI generates response and proposed actions
5. Frontend displays response
6. User confirms actions
7. Frontend calls `ai-actions` to execute
8. Database updates
9. UI reflects changes

### Memory System

- **Short-term**: Last 60 messages in conversation
- **Long-term**: Conversation summaries stored in database
- Memory summary updated after each conversation
- Enables context persistence across sessions

## Security

### Authentication

- Supabase Auth (email/password)
- JWT tokens for API authentication
- Session management in frontend

### Data Security

- Row Level Security on all tables
- Service role key never exposed to frontend
- Input validation and sanitization
- SQL injection prevention via parameterized queries

### Edge Function Security

- Bearer token authentication required
- CORS configured for allowed origins
- Rate limiting on API endpoints
- Input validation using Zod schemas

## Performance

### Optimizations

- Optimistic UI updates for instant feedback
- Connection pooling for database access
- Efficient React rendering with memoization
- Lazy loading for large data sets
- Indexed database queries

### Monitoring

- AI metrics tracking (response times, success rates)
- Error logging with correlation IDs
- Function performance monitoring
- Database query performance

## Testing

### Test Types

- **Unit Tests**: React components and services (Vitest)
- **Integration Tests**: Edge Functions (Deno)
- **E2E Tests**: Full user workflows (planned)

### Test Coverage

- Service layer business logic
- Edge Function handlers
- Validation and error handling
- Financial calculations

## Error Handling

### Frontend

- Error boundaries for React components
- User-friendly French error messages
- Retry logic for failed requests
- Graceful degradation

### Backend

- Structured error responses
- Transaction rollback on failures
- Detailed error logging
- Correlation IDs for debugging

## Deployment

### Frontend

- Static site build (`npm run build`)
- Deployed to Vercel/Netlify
- Environment variables configured

### Backend

- Edge Functions deployed to Supabase
- Database migrations applied
- Environment secrets configured
- RLS policies enabled

## Future Improvements

- [ ] E2E testing with Playwright
- [ ] Advanced analytics dashboard
- [ ] Export functionality (PDF, Excel)
- [ ] Mobile app (React Native)
- [ ] Multi-language support beyond French
- [ ] Advanced AI features (receipt OCR, tax suggestions)

