# Contributing to Fiscalia

Thank you for your interest in contributing to Fiscalia! This guide will help you get started.

## Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/your-username/fiscalia.git
   cd fiscalia
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   - Copy `.env.example` to `.env` (if available)
   - Configure your Supabase credentials
   - See [Environment Variables Guide](env-variables-guide.md) for details

4. **Set up Supabase**
   - Create a Supabase project
   - Apply database schema: `supabase db push --file supabase/schema.sql`
   - Apply policies: `supabase db push --file supabase/policies.sql`
   - See [Supabase Setup Guide](supabase-setup-guide.md) for details

5. **Run development server**
   ```bash
   npm run dev
   ```

## Code Style

### TypeScript

- Use TypeScript for all new code
- Follow existing type definitions in `types.ts`
- Avoid `any` types; use proper types or `unknown`
- Export types and interfaces for reuse

### React Components

- Use functional components with hooks
- Keep components focused and single-purpose
- Use `useCallback` and `useMemo` for performance optimization
- Extract reusable logic into custom hooks

### Styling

- Use Tailwind CSS utility classes
- Follow existing color scheme (defined in `tailwind.config.cjs`)
- Maintain responsive design (mobile-first approach)

### File Naming

- React components: PascalCase (e.g., `DashboardScreen.tsx`)
- Services: camelCase (e.g., `dataService.ts`)
- Types: PascalCase (e.g., `types.ts`)
- Constants: UPPER_SNAKE_CASE (e.g., `constants.tsx`)

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run tests in watch mode
npm run test:watch

# Run Deno tests (Edge Functions)
npm run test:deno
```

### Writing Tests

- Write tests for new features
- Test edge cases and error handling
- Maintain or improve test coverage
- Use descriptive test names

### Test Structure

- Unit tests: `tests/unit/`
- E2E tests: `tests/e2e/`
- Edge Function tests: `supabase/functions/[function-name]/index.test.ts`

## Making Changes

### Branching

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes
3. Write or update tests
4. Commit with clear messages

### Commit Messages

Follow this format:
```
type: short description

Longer description if needed
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
- `feat: add export to PDF functionality`
- `fix: correct profit calculation for jobs`
- `docs: update deployment guide`

### Pull Requests

1. **Before submitting**:
   - Run tests: `npm test`
   - Build successfully: `npm run build`
   - Update documentation if needed
   - Check for linting errors

2. **PR description should include**:
   - What changed and why
   - How to test the changes
   - Screenshots (if UI changes)
   - Related issues

3. **Keep PRs focused**:
   - One feature or fix per PR
   - Keep changes small and reviewable
   - Split large changes into multiple PRs

## Project Structure

- `components/`: React components
- `services/`: Business logic and API services
- `supabase/functions/`: Edge Functions
- `supabase/migrations/`: Database migrations
- `tests/`: Test files
- `docs/`: Documentation

## Guidelines

### Adding New Features

1. Discuss large features in an issue first
2. Follow existing patterns and architecture
3. Update documentation
4. Add tests
5. Consider backward compatibility

### Bug Fixes

1. Reproduce the bug
2. Write a test that fails
3. Fix the bug
4. Verify the test passes
5. Update documentation if needed

### Documentation

- Update README.md for user-facing changes
- Update ARCHITECTURE.md for architectural changes
- Update DEPLOYMENT.md for deployment changes
- Add inline comments for complex logic
- Use JSDoc for functions and types

## Code Review

- Be respectful and constructive
- Review code, not people
- Ask questions if something is unclear
- Suggest improvements, don't just point out issues
- Approve when changes are good

## Questions?

- Open an issue for bugs or feature requests
- Check existing documentation in `docs/`
- Review existing code for examples

Thank you for contributing to Fiscalia! 🎉




