# Effect Web Template - Agent Guidelines

## Runtime & Commands

- **Runtime**: Use Bun instead of Node.js for all operations
- **Scripts**: Use `bun run <script>` instead of npm/yarn/pnpm
- **Install**: Use `bun install` for package management
- **Execute**: Use `bun <file>` to run TypeScript files directly

## Build & Test Commands

- **Test all**: `bun run test` (runs vitest)
- **Test watch**: `bun run vitest:watch`
- **Single test**: `bun run vitest:run <test-file>`
- **Server build**: `bun run server:build`
- **Dev mode**: `bun run dev` (runs server, client, and db watch)

## Code Style & Conventions

- **Imports**: Use path mapping (`#server/*`, `#lib/*`, `#client/*`) and `.js` extensions
- **Effect patterns**: Use `Effect.gen` for async operations, pipe for composition
- **Types**: Strict TypeScript with Effect Schema for validation
- **Naming**: camelCase for variables/functions, PascalCase for classes/types
- **Error handling**: Use Effect's error handling, avoid try/catch
- **Database**: Use Kysely with Effect SQL, migrations via graphile-migrate
