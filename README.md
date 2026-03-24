# OneShot

OneShot is a secure, credential-free file transfer portal. It allows administrators to collect files from external users or clients without creating third-party accounts or relying on insecure email attachments. 

External users receive a single-use token that grants temporary upload access. Once the file is successfully uploaded, the token is permanently invalidated at the database level, immediately closing the upload window and eliminating lingering credential liability.

## Core Features

* **Single-Use Upload Tokens:** Administrators generate unique upload links that expire atomically upon the first successful file transfer.
* **No Third-Party Accounts:** Public registration is disabled by default. External users authenticate entirely via their ephemeral tokens.
* **Automated Dispatch:** Optional built-in SMTP integration to securely deliver upload links directly to external recipients.
* **File Isolation:** Uploaded files are stored using randomized, non-predictable internal identifiers rather than preserving original filenames on the filesystem.
* **Admin Audit Trail:** Built-in administrative views for tracking token generation, token consumption, and uploaded file metadata.
* **Strict API Type Safety:** End-to-end type safety enforced by OpenAPI, bridging the FastAPI backend and React frontend.

## Architecture & Tech Stack

* **Backend:** Python, FastAPI, SQLAlchemy
* **Frontend:** React, TypeScript, React Router
* **Authentication:** Passkey/WebAuthn for administrators (public registration blocked)

## Getting Started

### Prerequisites
* Python 3.10+ (managed via `uv` or your preferred environment tool)
* Node.js and npm
* A configured SMTP server (optional, for email dispatch)

### Environment Configuration
Copy the sample environment file and adjust the settings:
```bash
cp .env.example .env
```
Ensure `ONESHOT_SMTP_HOST` and related variables are configured if you intend to use the automated email dispatch feature.

### Running the Project

**1. Start the Backend API**
```bash
cd api
uv run uvicorn app.main:app --reload
```

**2. Start the Frontend Application**
```bash
cd web
npm install
npm run dev
```

## API Contract and Type Safety

OneShot treats OpenAPI as the strict contract between the backend and frontend. This prevents type drift and ensures UI components always match the available API routes and data shapes.

* **Backend schema source:** `api/openapi.json`
* **Generated frontend contract:** `web/src/api/openapi.ts`
* **Curated contract aliases:** `web/src/api/types.ts`

When backend API shapes change, you must regenerate the frontend contract to compile successfully:

```bash
cd web
npm run gen
```

## Documentation

Project documentation and architecture decisions are maintained in the `docs/` directory:

* `docs/openapi-contract.md` Contract workflow and schema enforcement rules.
