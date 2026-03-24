# OneShot
OneShot is a zero-trust file transfer portal. It replaces user accounts with single-use links to eliminate credential liability. Files are anonymized and stripped of executable risks. Access tokens bypass server logs, and upload windows close instantly upon completion.

## API Contract and Type Safety

OneShot treats OpenAPI as the contract between backend and frontend.

- Backend schema source: `api/openapi.json`
- Generated frontend contract: `web/src/api/openapi.ts`
- Curated contract aliases/assertions: `web/src/api/types.ts`

When backend API shapes change, regenerate the contract and types:

```bash
cd web
npm run gen
```

This flow prevents type drift by compiling frontend code against the generated schema-derived types.

## Documentation

Project documentation is organized under `docs/`:

- `docs/openapi-contract.md` – contract workflow and enforcement rules
