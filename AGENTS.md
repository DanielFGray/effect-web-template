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
- **Database**: `bun run db:reset` to reset, `bun run db:latest` to migrate

## Code Style & Conventions

- **Effect patterns**: Use `Effect.gen` for async operations, pipe for composition
- **Types**: Strict TypeScript with Effect Schema for validation
- **Services**: Use `Effect.Service` pattern for dependency injection
- **Models**: Use `Model.Class` from `@effect/sql` for database entities
- **Testing**: Use `@effect/vitest` with `.live()` for Effect-based tests
- **Naming**: camelCase for variables/functions, PascalCase for classes/types
- **Error handling**: Use Effect's error handling, avoid try/catch
- **Database**: Use Kysely with Effect SQL, migrations via graphile-migrate

Remember to consult effect docs where necessary to understand effect APIs.

READ AUTH_IMPLEMENTATION.md for info about authentication
