# Fiscalia

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

**Fiscalia** is an AI-powered financial assistant for French-speaking freelancers, project managers, and contractors in Québec, Canada. It helps users manage jobs, expenses, profits, and taxes through a natural, conversational interface in Québécois French.

## Features

- 🤖 **AI-Powered Chat Interface**: Natural French conversation for managing finances
- 📊 **Job/Contract Management**: Track projects with revenue, expenses, and profit calculations
- 💰 **Expense Tracking**: Categorize and manage expenses with receipt attachments
- 📈 **Financial Analytics**: Dashboard with revenue, expenses, and profit insights
- 🔐 **Secure Data Storage**: All data persisted in Supabase with Row Level Security
- 💬 **Conversation Memory**: AI remembers context across conversations
- 📱 **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Edge Functions)
- **AI**: LM Studio (local) or OpenRouter (cloud) for AI processing
- **Testing**: Vitest, Testing Library
- **Deployment**: Vercel/Netlify (frontend), Supabase (backend)

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- (Optional) LM Studio for local AI processing

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd fiscalia
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Create a `.env` file in the project root:
   ```env
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_SUPABASE_EDGE_FUNCTION_URL=https://your-project-url/functions/v1
   ```

4. **Set up Supabase database**
   
   See [docs/SUPABASE-SETUP.md](docs/supabase-setup-guide.md) for detailed instructions.

5. **Run the development server**
   ```bash
   npm run dev
   ```

   The app will be available at `http://127.0.0.1:5174`

## Project Structure

```
fiscalia/
├── components/          # React components
├── services/            # Business logic and API services
├── supabase/
│   ├── functions/       # Edge Functions (AI proxy, actions, financial sync)
│   ├── migrations/      # Database migrations
│   ├── schema.sql       # Database schema
│   └── policies.sql     # Row Level Security policies
├── tests/               # Test files
├── docs/                # Documentation
└── dist/                # Build output (gitignored)
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm test` - Run all tests (unit + Deno)
- `npm run test:unit` - Run unit tests only
- `npm run test:watch` - Run tests in watch mode
- `npm run test:deno` - Run Deno tests for Edge Functions

## Documentation

- **[Architecture](docs/ARCHITECTURE.md)** - System architecture and design decisions
- **[Supabase Setup](docs/supabase-setup-guide.md)** - Database and Edge Functions setup
- **[Environment Variables](docs/env-variables-guide.md)** - Configuration guide
- **[API Documentation](docs/api/ai.yaml)** - OpenAPI spec for Edge Functions
- **[Testing Guide](docs/TESTING-GUIDE.md)** - Testing procedures and test cases
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Production deployment instructions
- **[Contributing](docs/CONTRIBUTING.md)** - Development and contribution guidelines

## Development

### Adding New Features

1. Create feature branch: `git checkout -b feature/your-feature`
2. Make changes and write tests
3. Run tests: `npm test`
4. Commit and push: `git push origin feature/your-feature`
5. Open a Pull Request

### Code Style

- TypeScript for type safety
- ESLint and Prettier for code formatting
- Tailwind CSS for styling
- React hooks for state management

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment instructions.

### Quick Deploy

1. **Deploy Edge Functions**
   ```bash
   supabase functions deploy ai-proxy
   supabase functions deploy ai-actions
   supabase functions deploy financial-sync
   supabase functions deploy conversation-memory
   ```

2. **Deploy Frontend**
   - Build: `npm run build`
   - Deploy `dist/` to Vercel, Netlify, or your preferred hosting

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests for any improvements.

## License

[Add your license here]

## Support

For issues and questions:
- Open an issue on GitHub
- Check the [documentation](docs/)
- Review [testing guide](docs/TESTING-GUIDE.md) for common issues
