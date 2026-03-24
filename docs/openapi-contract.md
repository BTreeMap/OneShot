# OpenAPI Contract: Backend ↔ Frontend

## Purpose

To prevent backend/frontend type drift, OneShot uses generated OpenAPI types as the authoritative contract for API requests and responses.

## Source of Truth

- FastAPI app schema: generated to `api/openapi.json`
- TypeScript contract: generated to `web/src/api/openapi.ts`
- Curated aliases and compile-time assertions: `web/src/api/types.ts`

## Required Workflow for API Changes

1. Modify backend route models/handlers.
2. Regenerate OpenAPI + TS types:
   ```bash
   cd web
   npm run gen
   ```
3. Update frontend code to consume generated types (directly from `openapi.ts` or via `types.ts`).
4. Add/adjust compile-time route assertions in `web/src/api/types.ts` for new routes.
5. Run tests:
   - `cd api && uv run pytest`
   - `cd web && npm run test`

## Rules

- Do not create ad-hoc TypeScript interfaces for backend route payloads if generated OpenAPI types already exist.
- Prefer exporting reusable aliases from `web/src/api/types.ts` and using those in pages/components.
- Keep API path assertions current so route removals/renames fail TypeScript checks early.

## Why this matters

Security and admin workflows rely on exact payload shape agreement. Contract drift can silently break controls and observability. Generated types make mismatches fail at compile-time instead of runtime.
