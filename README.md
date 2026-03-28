# Openclaw WhatsApp Router

A production-structured MVP that bridges WhatsApp (via [Baileys](https://github.com/WhiskeySockets/Baileys)) with tenant-specific OpenClaw deployments through a lightweight extension sidecar.

---

## Architecture

```
WhatsApp User           Router Service (port 3000)        Extension Service (port 8090)    OpenClaw
     |                          |                                    |                        |
     |──── inbound msg ────────>|                                    |                        |
     |                          |── dedup check                      |                        |
     |                          |── lookup sender in registry        |                        |
     |                          |── POST /router/inbound ───────────>|                        |
     |                          |   X-Router-Secret header           |── processMessage() ───>|
     |                          |                                    |<── replyText ──────────|
     |                          |<── { replyText } ─────────────────|                        |
     |<─── outbound reply ──────|                                    |                        |
```

### Key design decisions

| Concern | Decision |
|---|---|
| Single visible identity | All replies go out through the **one** router WhatsApp number |
| Tenant isolation | Each sender number maps to exactly one tenant with its own extension URL |
| Auth | Router→extension uses `X-Router-Secret` header (shared secret) |
| Admin auth | `X-Admin-Secret` header on all `/admin/*` routes |
| Duplicate protection | In-memory dedup store with configurable TTL; implements `IDedupStore` for Redis swap-in |
| Persistence | JSON file for MVP; `ITenantStore` interface enables Postgres swap-in |
| OpenClaw client | `IOpenClawClient` interface; `MockOpenClawClient` ships until real API available |
| Session persistence | Baileys `useMultiFileAuthState` → mounted volume in k8s/Docker |
| Replicas | Router **must** run as a single replica (one WhatsApp session); extension scales horizontally |

---

## Repository Layout

```
.
├── src/                          # Router service
│   ├── index.ts                  # Entry point + graceful shutdown
│   ├── config.ts                 # All env-var config
│   ├── logger.ts                 # Pino logger (pino-pretty in dev)
│   ├── types.ts                  # Shared interfaces
│   ├── whatsapp/
│   │   └── client.ts             # Baileys socket, reconnect logic, message dispatch
│   ├── router/
│   │   └── messageRouter.ts      # dedup → tenant lookup → extension call → reply
│   ├── registry/
│   │   ├── ITenantStore.ts       # Persistence interface
│   │   └── tenantRegistry.ts     # JSON-backed implementation
│   ├── dedup/
│   │   ├── IDedupStore.ts        # Dedup interface
│   │   └── inMemoryDedupStore.ts # In-memory (TTL-based)
│   ├── extension/
│   │   └── extensionClient.ts    # fetch() POST to extension with auth header
│   └── api/
│       ├── server.ts             # Express app factory
│       ├── middleware/
│       │   └── adminAuth.ts      # X-Admin-Secret guard
│       └── routes/
│           ├── health.ts         # GET /health, /health/ready
│           └── admin.ts          # CRUD /admin/tenants
│
├── extension/                    # Extension sidecar (Fastify)
│   └── src/
│       ├── index.ts
│       ├── config.ts
│       ├── logger.ts
│       ├── types.ts
│       ├── server.ts             # Fastify app factory
│       ├── routes/
│       │   └── inbound.ts        # POST /router/inbound (auth + schema validation)
│       └── openclaw/
│           ├── IOpenClawClient.ts
│           ├── mockClient.ts     # Echo mock (default when OPENCLAW_BASE_URL unset)
│           └── httpClient.ts     # Real HTTP client
│
├── tests/
│   ├── unit/
│   │   ├── tenantRegistry.test.ts
│   │   ├── messageRouter.test.ts
│   │   └── dedupStore.test.ts
│   └── integration/
│       ├── healthApi.test.ts
│       └── adminApi.test.ts
│
├── k8s/
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secrets.yaml              # Template — do NOT commit real secrets
│   ├── router-deployment.yaml    # replicas: 1, Recreate strategy
│   ├── router-service.yaml       # + PersistentVolumeClaim
│   ├── extension-deployment.yaml # replicas: 2, RollingUpdate
│   └── extension-service.yaml
│
├── Dockerfile                    # Router multi-stage image (node:20-alpine)
├── extension/Dockerfile          # Extension multi-stage image
├── docker-compose.yml
├── vitest.config.ts
├── .env.example
├── extension/.env.example
└── tenant-registry.json          # Seed data
```

---

## Prerequisites

- Node.js 20+
- npm 10+
- Docker + Docker Compose (for containerised run)
- kubectl + a cluster (for Kubernetes)

---

## Quick Start — Local Development

### 1. Install dependencies

```bash
# Router service (root)
npm install

# Extension service
cd extension && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
cp extension/.env.example extension/.env
# Edit both files as needed
```

### 3. Start the extension service

```bash
cd extension
npm run dev
```

### 4. Start the router service

```bash
npm run dev
```

On first run a QR code is printed in the terminal. Scan it with the WhatsApp app on the **router number**. Credentials are cached in `./whatsapp-session/` and reused on restart.

---

## Running with Docker Compose

```bash
# Set secrets
export ADMIN_SECRET=your-admin-secret
export ROUTER_SECRET=your-router-secret

docker compose up --build
```

The router QR code appears in the `router` container logs on first run:

```bash
docker compose logs -f router
```

Scan it once; the session is persisted in the `whatsapp_session` named volume and reused on restart.

---

## Running on Kubernetes

```bash
# 1. Build and push images to your registry
docker build -t your-registry/openclaw-router:latest .
docker build -t your-registry/openclaw-extension:latest ./extension

# 2. Apply manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml

# 3. Create the secret (do NOT apply secrets.yaml directly in production)
kubectl create secret generic openclaw-secrets -n openclaw \
  --from-literal=ADMIN_SECRET=<your-admin-secret> \
  --from-literal=ROUTER_SECRET=<your-router-secret>

# 4. Deploy extension first
kubectl apply -f k8s/extension-deployment.yaml
kubectl apply -f k8s/extension-service.yaml

# 5. Deploy router (creates PVC too)
kubectl apply -f k8s/router-service.yaml
kubectl apply -f k8s/router-deployment.yaml

# 6. Scan QR on first run
kubectl logs -n openclaw deploy/openclaw-router -f
```

---

## Running Tests

```bash
npm test                  # run once
npm run test:watch        # watch mode
npm run test:coverage     # coverage report → ./coverage/
```

---

## API Reference

### Health (unauthenticated)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/health/ready` | Readiness check |

### Admin API (requires `X-Admin-Secret` header)

| Method | Path | Description |
|---|---|---|
| GET | `/admin/tenants` | List all tenants |
| GET | `/admin/tenants/:id` | Get tenant by ID |
| POST | `/admin/tenants` | Create or replace tenant |
| PATCH | `/admin/tenants/:id` | Partial update |
| DELETE | `/admin/tenants/:id` | Delete tenant |

**Create or update a tenant:**

```bash
curl -X POST http://localhost:3000/admin/tenants \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: changeme" \
  -d '{
    "tenantId": "acme-corp",
    "senderNumbers": ["919812345678", "919898765432"],
    "openclawExtensionUrl": "http://localhost:8090/router/inbound",
    "enabled": true
  }'
```

**Disable a tenant without deleting it:**

```bash
curl -X PATCH http://localhost:3000/admin/tenants/acme-corp \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: changeme" \
  -d '{"enabled": false}'
```

**List all tenants:**

```bash
curl http://localhost:3000/admin/tenants \
  -H "X-Admin-Secret: changeme"
```

### Extension inbound (requires `X-Router-Secret` header)

| Method | Path | Description |
|---|---|---|
| POST | `/router/inbound` | Receive message payload from router |
| GET | `/health` | Liveness |
| GET | `/health/ready` | Readiness |

---

## Tenant Registry Format

```json
{
  "tenants": [
    {
      "tenantId": "tenant-a",
      "senderNumbers": ["919812345678"],
      "openclawExtensionUrl": "http://localhost:8090/router/inbound",
      "enabled": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

- **`senderNumbers`**: E.164 format **without** leading `+`, e.g. `"919812345678"`.
- Multiple numbers can map to the same tenant.
- `enabled: false` silently drops all messages from that tenant's numbers.

---

## Environment Variables

### Router (`.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Admin API HTTP port |
| `ADMIN_SECRET` | `changeme` | Value expected in `X-Admin-Secret` header |
| `ROUTER_SECRET` | `router-secret` | Value sent in `X-Router-Secret` to extension |
| `TENANT_REGISTRY_PATH` | `./tenant-registry.json` | Path to JSON registry |
| `WHATSAPP_SESSION_DIR` | `./whatsapp-session` | Baileys auth state directory |
| `DEDUP_TTL_MS` | `86400000` | Dedup entry TTL in ms (24 h) |
| `LOG_LEVEL` | `info` | Pino level |
| `NODE_ENV` | `development` | Enables `pino-pretty` when `development` |

### Extension (`extension/.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8090` | Extension HTTP port |
| `ROUTER_SECRET` | `router-secret` | Must match router's `ROUTER_SECRET` |
| `OPENCLAW_BASE_URL` | *(empty)* | Set to real OpenClaw URL; empty uses mock |
| `LOG_LEVEL` | `info` | Pino level |

---

## Swapping to Production Backends

### PostgreSQL tenant store

Implement `ITenantStore` (`src/registry/ITenantStore.ts`) using `pg` or Prisma, then swap in `src/index.ts`:

```ts
// const tenantStore = new JsonTenantStore(config.tenantRegistryPath)
const tenantStore = new PgTenantStore(pgPool)
```

### Redis dedup store

Implement `IDedupStore` (`src/dedup/IDedupStore.ts`) using `ioredis`, then swap in `src/index.ts`:

```ts
// const dedupStore = new InMemoryDedupStore()
const dedupStore = new RedisDedupStore(redisClient)
```

### Real OpenClaw client

Set `OPENCLAW_BASE_URL` in `extension/.env` — the extension automatically switches from `MockOpenClawClient` to `HttpOpenClawClient`.

---

## Non-Goals for MVP

- Media / voice note routing
- Multi-router HA clustering
- Official WhatsApp Business API
- UI dashboard
- Full DB migration framework
- OpenTelemetry tracing

---

## License

Private — All rights reserved.
