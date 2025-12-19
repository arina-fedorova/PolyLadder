# F000: Project Setup & Development Environment

**Feature Code**: F000
**Created**: 2025-12-17
**Phase**: 0 - Foundation & Infrastructure
**Status**: Not Started

---

## Description

Initialize the PolyLadder monorepo with all necessary tooling, configurations, and package structure. This feature establishes the foundation for all future development work.

## Success Criteria

- [ ] Monorepo initialized with pnpm workspaces
- [ ] TypeScript configured (base + per-package configs)
- [ ] Code quality tools configured (ESLint, Prettier)
- [ ] Git hooks configured (pre-commit, pre-push)
- [ ] CI/CD pipeline basics in place (GitHub Actions)
- [ ] All 5 packages created with correct structure
- [ ] Developer can run `pnpm install` and `pnpm build` successfully

---

## Tasks

### Task 1: Initialize Repository & Monorepo Structure

**Description**: Set up Git repository and pnpm workspace configuration.

**Implementation Plan**:

1. Initialize Git repository:
   ```bash
   git init
   git branch -M main
   ```

2. Create root `package.json`:
   ```json
   {
     "name": "polyladder",
     "version": "0.1.0",
     "private": true,
     "type": "module",
     "scripts": {
       "build": "pnpm -r build",
       "dev": "docker-compose up",
       "test": "pnpm -r test",
       "lint": "pnpm -r lint",
       "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\""
     },
     "engines": {
       "node": ">=20.0.0",
       "pnpm": ">=8.0.0"
     },
     "packageManager": "pnpm@8.15.0"
   }
   ```

3. Create `pnpm-workspace.yaml`:
   ```yaml
   packages:
     - 'packages/*'
   ```

4. Create `.gitignore`:
   ```
   node_modules/
   dist/
   build/
   .env
   .env.local
   .DS_Store
   *.log
   coverage/
   .vscode/
   .idea/
   ```

5. Create `.npmrc`:
   ```
   auto-install-peers=true
   strict-peer-dependencies=false
   ```

**Files Created**:
- `package.json`
- `pnpm-workspace.yaml`
- `.gitignore`
- `.npmrc`
- `.git/` (initialized)

---

### Task 2: Configure TypeScript

**Description**: Set up TypeScript with strict configuration for all packages.

**Implementation Plan**:

1. Install TypeScript at root:
   ```bash
   pnpm add -D -w typescript @types/node
   ```

2. Create root `tsconfig.json` (base configuration):
   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "ES2022",
       "lib": ["ES2022"],
       "moduleResolution": "bundler",
       "resolveJsonModule": true,
       "allowJs": false,
       "strict": true,
       "noUnusedLocals": true,
       "noUnusedParameters": true,
       "noImplicitReturns": true,
       "noFallthroughCasesInSwitch": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true,
       "declaration": true,
       "declarationMap": true,
       "sourceMap": true,
       "composite": true
     }
   }
   ```

3. Each package will extend this base config with package-specific settings.

**Files Created**:
- `tsconfig.json`

---

### Task 3: Configure ESLint & Prettier

**Description**: Set up code quality tools with shared configurations.

**Implementation Plan**:

1. Install ESLint dependencies:
   ```bash
   pnpm add -D -w eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
   ```

2. Create `.eslintrc.json`:
   ```json
   {
     "parser": "@typescript-eslint/parser",
     "extends": [
       "eslint:recommended",
       "plugin:@typescript-eslint/recommended",
       "plugin:@typescript-eslint/recommended-requiring-type-checking"
     ],
     "parserOptions": {
       "ecmaVersion": 2022,
       "sourceType": "module",
       "project": "./tsconfig.json"
     },
     "rules": {
       "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
       "@typescript-eslint/explicit-function-return-type": "off",
       "@typescript-eslint/no-explicit-any": "error",
       "no-console": ["warn", { "allow": ["warn", "error"] }]
     }
   }
   ```

3. Install Prettier:
   ```bash
   pnpm add -D -w prettier eslint-config-prettier
   ```

4. Create `.prettierrc.json`:
   ```json
   {
     "semi": true,
     "trailingComma": "es5",
     "singleQuote": true,
     "printWidth": 100,
     "tabWidth": 2,
     "useTabs": false
   }
   ```

5. Create `.prettierignore`:
   ```
   node_modules
   dist
   build
   coverage
   pnpm-lock.yaml
   ```

**Files Created**:
- `.eslintrc.json`
- `.prettierrc.json`
- `.prettierignore`

---

### Task 4: Configure Git Hooks (Husky)

**Description**: Set up pre-commit and pre-push hooks to enforce code quality.

**Implementation Plan**:

1. Install Husky and lint-staged:
   ```bash
   pnpm add -D -w husky lint-staged
   pnpm exec husky init
   ```

2. Create `.husky/pre-commit`:
   ```bash
   #!/usr/bin/env sh
   . "$(dirname -- "$0")/_/husky.sh"

   pnpm exec lint-staged
   ```

3. Create `.husky/pre-push`:
   ```bash
   #!/usr/bin/env sh
   . "$(dirname -- "$0")/_/husky.sh"

   pnpm test
   ```

4. Add lint-staged configuration to root `package.json`:
   ```json
   {
     "lint-staged": {
       "*.{ts,tsx}": [
         "eslint --fix",
         "prettier --write"
       ],
       "*.{json,md}": [
         "prettier --write"
       ]
     }
   }
   ```

**Files Created**:
- `.husky/pre-commit`
- `.husky/pre-push`

---

### Task 5: Create Package Structure

**Description**: Create all 5 packages with basic structure.

**Implementation Plan**:

For each package, create the following structure:

1. **@polyladder/core**:
   ```
   packages/core/
   ├── src/
   │   └── index.ts
   ├── tests/
   │   └── .gitkeep
   ├── package.json
   └── tsconfig.json
   ```

   `package.json`:
   ```json
   {
     "name": "@polyladder/core",
     "version": "0.1.0",
     "type": "module",
     "main": "./dist/index.js",
     "types": "./dist/index.d.ts",
     "scripts": {
       "build": "tsc",
       "test": "vitest run",
       "test:watch": "vitest",
       "lint": "eslint src/**/*.ts"
     }
   }
   ```

   `tsconfig.json`:
   ```json
   {
     "extends": "../../tsconfig.json",
     "compilerOptions": {
       "outDir": "./dist",
       "rootDir": "./src"
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist", "tests"]
   }
   ```

2. **@polyladder/db** (similar structure)
3. **@polyladder/api** (similar structure)
4. **@polyladder/refinement-service** (similar structure)
5. **@polyladder/web** (similar structure, but with Vite config)

**Files Created**:
- `packages/core/`, `packages/db/`, `packages/api/`, `packages/refinement-service/`, `packages/web/`
- Each with `src/index.ts`, `package.json`, `tsconfig.json`

---

### Task 6: Configure CI/CD Pipeline (GitHub Actions)

**Description**: Set up basic CI/CD pipeline for automated testing and linting.

**Implementation Plan**:

1. Create `.github/workflows/ci.yml`:
   ```yaml
   name: CI

   on:
     push:
       branches: [main]
     pull_request:
       branches: [main]

   jobs:
     test:
       runs-on: ubuntu-latest

       services:
         postgres:
           image: postgres:15
           env:
             POSTGRES_USER: test
             POSTGRES_PASSWORD: test
             POSTGRES_DB: polyladder_test
           options: >-
             --health-cmd pg_isready
             --health-interval 10s
             --health-timeout 5s
             --health-retries 5
           ports:
             - 5432:5432

       steps:
         - uses: actions/checkout@v4

         - uses: pnpm/action-setup@v2
           with:
             version: 8

         - uses: actions/setup-node@v4
           with:
             node-version: '20'
             cache: 'pnpm'

         - name: Install dependencies
           run: pnpm install --frozen-lockfile

         - name: Lint
           run: pnpm lint

         - name: Build
           run: pnpm build

         - name: Test
           run: pnpm test
           env:
             DATABASE_URL: postgres://test:test@localhost:5432/polyladder_test
   ```

**Files Created**:
- `.github/workflows/ci.yml`

---

### Task 7: Create README & Documentation

**Description**: Document project setup and development workflow.

**Implementation Plan**:

1. Create root `README.md`:
   ```markdown
   # PolyLadder

   Cloud-hosted language learning system with parallel learning support.

   ## Quick Start

   ### Prerequisites
   - Node.js 20.x LTS
   - pnpm 8.x
   - Docker & Docker Compose

   ### Installation

   \`\`\`bash
   # Clone repository
   git clone <repo-url>
   cd polyladder

   # Install dependencies
   pnpm install

   # Start development environment
   pnpm dev
   \`\`\`

   ### Development

   - Frontend: http://localhost:5173
   - API: http://localhost:3000
   - PostgreSQL: localhost:5432

   ## Architecture

   See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for detailed system design.

   ## Contributing

   See [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for development guidelines.

   ## License

   MIT License - see [LICENSE](./LICENSE) for details.
   ```

2. Ensure existing documentation is referenced:
   - `docs/TECHNICAL_SPECIFICATION.md` ✓ (already exists)
   - `docs/ARCHITECTURE.md` ✓ (already exists)

**Files Created**:
- `README.md`

---

### Task 8: Verify Setup

**Description**: Test that the entire setup works correctly.

**Implementation Plan**:

1. Install all dependencies:
   ```bash
   pnpm install
   ```

2. Run build:
   ```bash
   pnpm build
   ```
   Expected: All packages build successfully

3. Run linting:
   ```bash
   pnpm lint
   ```
   Expected: No errors

4. Run formatting:
   ```bash
   pnpm format
   ```
   Expected: Files formatted correctly

5. Test git hooks:
   ```bash
   # Make a dummy change
   echo "test" >> packages/core/src/index.ts
   git add .
   git commit -m "test: verify pre-commit hook"
   ```
   Expected: Pre-commit hook runs lint-staged

6. Create initial commit:
   ```bash
   git add .
   git commit -m "feat: initialize project with F000"
   ```

**Validation**:
- ✅ `pnpm install` succeeds
- ✅ `pnpm build` succeeds
- ✅ `pnpm lint` passes
- ✅ Git hooks execute
- ✅ CI pipeline runs (if pushed to GitHub)

---

## Dependencies

- **Blocks**: F001, F002, F003 (all subsequent features depend on this)
- **Depends on**: None (first feature)

---

## Notes

- Keep root `package.json` minimal - most dependencies go in specific packages
- Use workspace protocol for inter-package dependencies: `"@polyladder/core": "workspace:*"`
- All packages use ESM (type: "module")
- Strict TypeScript mode enforced across all packages
