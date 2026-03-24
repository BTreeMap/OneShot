# oneshot-app

Full-stack hackathon project scaffolded with [h4ckath0n](https://github.com/BTreeMap/h4ckath0n).

## Quick start

```bash
# Start both API and web servers
cd api
uv run h4ckath0n dev
```

API runs at http://localhost:8000, web at http://localhost:5173.

## Structure

```
oneshot-app/
  api/        Python (FastAPI + h4ckath0n library)
  web/        React + Vite + TypeScript + Tailwind v4
  .env        Environment variables (gitignored)
```

## Auth model

- Passkeys (WebAuthn) for registration and login
- Each device gets a P-256 keypair (private key non-extractable, stored in IndexedDB)
- API requests use short-lived JWTs (15 min) signed by the device key
- Server verifies JWT signature and enforces RBAC from the database
- No privilege claims in the JWT; all roles/scopes are server-derived

## OpenAPI types

The template keeps OpenAPI and frontend types in sync.

```bash
cd web
npm run gen
```

This command regenerates `api/openapi.json` and `web/src/api/openapi.ts`.

## Development

### API

```bash
cd api
uv sync
uv run uvicorn app.main:app --reload
```

### Web

```bash
cd web
npm install
npm run dev
```

### Environment

Copy `.env.example` to `.env` and set values as needed. See the h4ckath0n docs for all configuration options.

## License

MIT
