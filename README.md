# Lucien Sovereign Portal

Monorepo (pnpm workspace) s aplikacemi a sdílenými balíčky.

## Struktura

- `apps/bff` — Next.js 14+ App Router (TypeScript)
- `apps/portal` — Vite + React + TypeScript + Tailwind
- `packages/contracts` — sdílené DTO typy
- `packages/ui` — sdílené UI komponenty (volitelně)

## Požadavky

- Node.js 18+
- pnpm 9+

## Lokální spuštění (dev)

```bash
pnpm install
pnpm dev
```

- BFF běží na `http://localhost:3000`
- Portal běží na `http://localhost:5173`
- Vite proxy posílá `/api` na BFF (`http://localhost:3000`)

### Mock login

V dev režimu je dostupný endpoint, který nastaví `lucien_session` cookie:

1. Otevři v prohlížeči: `http://localhost:3000/api/dev/login`
2. Pak jdi na: `http://localhost:5173/engagements/PRJ-001/intel`

## Local Run

```bash
pnpm install
pnpm dev
```

1. Otevři `http://localhost:3000/api/dev/login`
2. Otevři `http://localhost:5173`

## Auth provisioning

Auth users are stored in a database (SQLite by default). Provision users via the invite API:

- `POST /api/auth/invite` (requires `INVITE_API_SECRET` header)
- Supports `magic` invites (magic link) or `temp_password` invites.

Required env (BFF):

- `AUTH_DB_PATH` (default: `./data/lucien-auth.sqlite`)
- `INVITE_API_SECRET`
- `INVITE_BASE_URL` or `PORTAL_BASE_URL` (used to generate magic links)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (for email delivery)

`LUCIEN_JWT_SECRET` is required in production. In development you can either set it explicitly or enable the fallback with `ALLOW_DEV_JWT_FALLBACK=true`.

### Invite API (example)

```bash
curl -X POST http://localhost:3000/api/auth/invite \
  -H "Content-Type: application/json" \
  -H "x-invite-secret: <INVITE_API_SECRET>" \
  -d '{
    "email": "client@example.com",
    "role": "CLIENT",
    "engagementIds": ["PRJ-001"],
    "type": "magic"
  }'
```

### Tier configuration

Set `LUCIEN_TIER_FIELD` in `apps/bff/.env.example` (or your secret store) to the ERP `Project` field that stores the package tier (`INTEL_ONLY`, `BLUEPRINT`, or `CUSTOM`). This ensures `/api/engagements/:id/summary` always returns a non-null `tier`, which drives module wiring and the dashboard package badge.

### Secure channel persistence

The secure channel state and ciphertext log now persist in Redis (see `UPSTASH_REDIS_REST_URL`/`TOKEN`). Configure `LUCIEN_SECURE_CHANNEL_RETENTION_SECONDS` and `LUCIEN_SECURE_CHANNEL_MAX_MESSAGES` to control retention/paging, and ensure the portal continues to advertise “E2EE STUB — CIPHERTEXT ONLY” until actual plaintext handling is implemented.

## Test uploadu (curl)

```bash
# získej cookie
curl -i -c /tmp/lucien.cookie http://localhost:3000/api/dev/login

# OK upload (1MB)
dd if=/dev/zero of=/tmp/lucien-1mb.bin bs=1m count=1
curl -i -b /tmp/lucien.cookie \
  -F "file=@/tmp/lucien-1mb.bin" \
  -F "requestId=REQ-2026-0001" \
  http://localhost:3000/api/engagements/PRJ-001/intel/upload

# Over limit (51MB) => expected 413

dd if=/dev/zero of=/tmp/lucien-51mb.bin bs=1m count=51
curl -i -b /tmp/lucien.cookie \
  -F "file=@/tmp/lucien-51mb.bin" \
  -F "requestId=REQ-2026-0001" \
  http://localhost:3000/api/engagements/PRJ-001/intel/upload
```

## Build

```bash
pnpm build
```

## Smoke Tests

1. Dev login:
   otevři `http://localhost:3000/api/dev/login`

2. Intel list:
   otevři `http://localhost:5173/engagements/PRJ-001/intel`
   očekávám 2 requesty (`REQ-2026-0001`, `REQ-2026-0002`)

3. Upload test:
   upload malého souboru -> 200 + `INTEL_RECEIVED`

4. 51MB test (očekává 413):
   - mac/linux:
     `dd if=/dev/zero of=./tmp_51mb.bin bs=1m count=51`
   - windows powershell:
     `fsutil file createnew .\\tmp_51mb.bin 53477376`
     upload -> 413 `PAYLOAD_TOO_LARGE`

Automatizovaný smoke test:

```bash
node scripts/smoke.mjs
```

## Lint

```bash
pnpm lint
```

## Proměnné prostředí

- `apps/bff/.env.example`
- `apps/portal/.env.example`
