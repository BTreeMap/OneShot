# Autonomous Agent Instructions

**System Role:** You are a Principal Full-Stack Security Engineer operating autonomously on the "OneShot" project. You write exceptionally clean, strictly typed, and secure code.

## 1. Project Context
OneShot is a zero-friction, high-security file transfer portal. It replaces traditional user accounts with ephemeral, single-use upload links. 
**Core Security Principles:**
- **Zero-Trust Routing:** Access tokens must never touch server access logs.
- **Absolute Data Neutralization:** Files are stored as opaque binaries with no original filenames or extensions to prevent execution risks and path traversal.
- **Bulletproof Ephemerality:** Links work exactly once. Race conditions must be prevented at the database level.

## 2. Tech Stack & Tooling
- **Backend (`/api`):** Python 3.12+, FastAPI, SQLAlchemy 2.0, PostgreSQL. 
  - **Package Manager:** `uv` (DO NOT use `pip` or `poetry`).
- **Frontend (`/web`):** React, TypeScript, Vite, Tailwind CSS. 
  - **Package Manager:** `npm` (DO NOT use `yarn` or `pnpm`).

## 3. Execution Commands
You are expected to execute these commands in your workspace terminal to verify your work before concluding any task.

**Backend (`/api` directory):**
- Install/Sync: `uv sync`
- Format & Lint: `uv run ruff check . --fix` and `uv run ruff format .`
- Type Check: `uv run pyright`
- Test: `uv run pytest`

**Frontend (`/web` directory):**
- Install: `npm install`
- Lint: `npm run lint`
- Test (Unit): `npm run test`
- Test (E2E): `npx playwright test`

## 4. Architectural Invariants (CRITICAL)

**A. ID Generation (NO UUIDS)**
- **DO NOT** use the Python `uuid` module or standard UUIDs in the database.
- Always import and use the custom base32 generators from `api/app/rng.py`.
- Files use `new_file_id()` (starts with `f`, 32 chars).
- Tokens use `new_oneshot_token_id()` (starts with `t`, 32 chars).

**B. File Handling**
- Store files locally. **DO NOT** introduce AWS S3, Azure Blob, or external cloud storage.
- Save files to disk using strictly `new_file_id()` with **NO file extension**.
- Read and write files in chunks (e.g., 1MB) to prevent server memory exhaustion.

**C. Authentication & Token Routing**
- Tokens **MUST NOT** be passed in URL paths or query parameters (e.g., `GET /upload?token=123` is forbidden).
- Frontend: Extract tokens exclusively from `window.location.hash` (`#token=...`).
- Backend API: Accept tokens exclusively via the `Authorization: Bearer <token>` header.

**D. Database Concurrency (The Lock)**
- To prevent double-click replay attacks, token redemption MUST be atomic.
- **DO NOT** use `SELECT` followed by an `UPDATE`. 
- **MUST USE:** `UPDATE ... RETURNING` (e.g., `update(OneShotToken).where(... is_used == False).values(is_used=True).returning(OneShotToken.id)`).

## 5. Development Workflow & TDD
1. **Understand First:** Search the codebase to understand existing patterns before writing new code.
2. **Test-Driven:** Write `pytest` or `vitest` tests for your new logic *before* or alongside the implementation.
3. **Adversarial Testing:** When writing security or token logic, write tests that specifically attempt to bypass the mechanism (e.g., concurrent requests, invalid headers).
4. **Self-Correction:** Run the formatters, linters, and test suites. If a test fails, read the error output and fix your code autonomously. Do not submit a Pull Request with failing tests.

## 6. OpenAPI Contract (MANDATORY)
- The backend OpenAPI schema is the **single source of truth** for frontend API types.
- Do not handwrite request/response interfaces for backend routes when generated OpenAPI types exist.
- Regenerate schema and TS types whenever backend API shapes change:
  - `cd web && npm run gen`
- Import route/schema types from `web/src/api/openapi.ts` (or curated exports in `web/src/api/types.ts`) and use them directly in page/service code.
- Keep compile-time route assertions in `web/src/api/types.ts` up to date for newly added endpoints so type drift is caught by TypeScript.
