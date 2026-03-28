# WhatsApp Router — OpenClaw Extension

Drop this folder into OpenClaw's `extensions/` directory.
It registers two routes that the WhatsApp Router service calls:

| Route | Purpose |
|---|---|
| `POST /router/inbound` | Receives inbound WhatsApp messages from the router |
| `GET  /router/health`  | Liveness probe — router pings this to verify extension is up |

---

## Setup

### 1. Copy the folder

```
cp -r whatsapp-router/  your-openclaw/extensions/whatsapp-router/
```

### 2. Register in OpenClaw's server (Express)

```typescript
import { registerWhatsAppExtension } from './extensions/whatsapp-router/index.js'

// Add this after express.json() middleware is registered:
registerWhatsAppExtension(app, {
  routerSecret: process.env.WHATSAPP_ROUTER_SECRET,   // must match router's ROUTER_SECRET

  processMessage: async (payload) => {
    // payload.senderNumber  — caller's phone number (E.164 without +)
    // payload.body          — the WhatsApp message text
    // payload.tenantId      — your OpenClaw tenant ID
    // payload.messageId     — Baileys message ID
    // payload.timestamp     — epoch ms

    const session = await openClaw.getOrCreateSession(payload.senderNumber)
    const result  = await openClaw.processMessage(session, payload.body)
    return result.reply    // string to send back, or null to send nothing
  },
})
```

### 3. Register in OpenClaw's server (Fastify)

```typescript
import { registerWhatsAppExtensionFastify } from './extensions/whatsapp-router/index.js'

await app.register(registerWhatsAppExtensionFastify, {
  routerSecret: process.env.WHATSAPP_ROUTER_SECRET,
  processMessage: async (payload) => {
    const session = await openClaw.getOrCreateSession(payload.senderNumber)
    const result  = await openClaw.processMessage(session, payload.body)
    return result.reply
  },
})
```

### 4. Set the environment variable

```env
WHATSAPP_ROUTER_SECRET=<same value as ROUTER_SECRET in the router service>
```

---

## How the routing works

```
WhatsApp User
    │
    ▼
WhatsApp Router  (single number)
    │  looks up sender → tenant in registry
    │  POST /router/inbound  + X-Router-Secret header
    ▼
OpenClaw Extension (this code, inside your OpenClaw build)
    │  validates X-Router-Secret
    │  calls your processMessage() function
    ▼
OpenClaw internals
    │  returns reply text
    ▼
WhatsApp Router  → sends reply back to the user
```

---

## Managing the router from Openclaw-UI

The Openclaw-UI triggers the bot-manager, which calls the WhatsApp Router's admin API:

```
Openclaw-UI  →  bot-manager  →  WhatsApp Router API
```

### Register this OpenClaw instance as a tenant

```bash
# Add tenant with phone numbers
POST http://whatsapp-router:3000/admin/tenants
X-Admin-Secret: <ADMIN_SECRET>
{
  "tenantId": "tenant-a",
  "openclawExtensionUrl": "http://openclaw-tenant-a:3000/router/inbound",
  "senderNumbers": ["919812345678"]
}

# Add a phone number to an existing tenant
POST http://whatsapp-router:3000/admin/tenants/tenant-a/numbers
X-Admin-Secret: <ADMIN_SECRET>
{ "number": "919812345678" }

# Remove a phone number
DELETE http://whatsapp-router:3000/admin/tenants/tenant-a/numbers/919812345678
X-Admin-Secret: <ADMIN_SECRET>

# Disable a tenant (stop routing without deleting)
PATCH http://whatsapp-router:3000/admin/tenants/tenant-a
X-Admin-Secret: <ADMIN_SECRET>
{ "enabled": false }
```

No files to copy into any file — all configuration lives in the router's tenant registry and is managed via API.
