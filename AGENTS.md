# Repository Guidelines

## Project Structure & Module Organization

`naija-city` is a TypeScript browser city-building game using Vite and Phaser. `shared/simulation/` contains deterministic rules; `shared/types/` defines serializable state. `client/game/` renders the city, `client/ui/` styles management controls, and `client/persistence/` implements local saves. Tests live in `tests/`; static files live in `public/`.

Keep simulation independent of Phaser and the DOM. Document structural changes in `README.md`. Exclude generated output and dependencies from version control.

## Build, Test, and Development Commands

Use `npm install` to install dependencies, `npm run dev` to start Vite, and `npm run build` to type-check and generate `dist/`. `npm run preview` serves the production build.

Run `npm test` for Vitest tests and `npm run lint` for TypeScript checking. Use `git diff --check` to catch whitespace errors before committing.

## Coding Style & Naming Conventions

Use two-space indentation and strict TypeScript. `.editorconfig` defines whitespace conventions. Use PascalCase classes and camelCase functions and variables. No separate formatter or ESLint is configured.

Use descriptive names that reflect gameplay responsibilities. Keep modules focused, avoid unrelated changes, and use concise Markdown headings and repository-relative paths in documentation.

## Testing Guidelines

Use Vitest and name tests `*.test.ts`. Test simulation rules without rendering: placement costs, development, population, economy and offline determinism. Persistence changes should cover save round trips and malformed state. No coverage threshold is configured. Include regression tests for gameplay bugs when practical.

## Commit & Pull Request Guidelines

The only existing commit is `Initial commit`, so no established message convention can be inferred. Use short, imperative summaries, such as `Add building placement rules`.

Pull requests should explain the change, link relevant issues, and describe validation performed. Include screenshots or recordings for visible gameplay changes. Identify any new dependencies, setup steps, or known limitations.

## Security & Configuration

Never commit credentials, local environment files, or private keys. Provide sanitized configuration examples when configuration is introduced.
