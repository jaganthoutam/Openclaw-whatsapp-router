Use this as the build document for Codex.

OpenClaw WhatsApp Router

Build Plan and Technical Specification

1. Objective

Build a single-number WhatsApp router platform for OpenClaw using an open-source WhatsApp Web stack instead of the official WhatsApp Business API.

The router must:
	•	own one router WhatsApp number
	•	receive inbound messages on that number
	•	identify the sender phone number
	•	map that sender to a specific OpenClaw deployment
	•	forward the message to that deployment through a custom extension/connector
	•	receive the response from that OpenClaw deployment
	•	send the outbound message back to the user through the same router number

This is a centralized routing model, not a multi-number model.

2. Core Functional Requirement

Required behavior

When a user sends a message to the single router WhatsApp number:
	1.	Router receives the inbound WhatsApp event
	2.	Router extracts sender number
	3.	Router checks registry mapping
	4.	Router finds the corresponding OpenClaw instance
	5.	Router forwards the message to that tenant’s OpenClaw extension
	6.	OpenClaw processes the message
	7.	OpenClaw extension returns a response payload
	8.	Router sends reply back to the user via the same router WhatsApp number

3. Important Functional Rule

This system does not expose separate WhatsApp identities per tenant.

The visible WhatsApp identity is always:
	•	the single router number

Tenants are isolated at the routing and processing layer only.

4. Architecture Overview

Main components

A. WhatsApp Router Service
Central Node.js/TypeScript service using Baileys.

Responsibilities:
	•	maintain WhatsApp session
	•	QR / pairing support
	•	receive inbound messages
	•	normalize inbound events
	•	lookup tenant mapping
	•	call OpenClaw extension
	•	send outbound replies
	•	keep audit logs
	•	expose admin and health endpoints

B. Tenant Registry
A registry that maps sender phone numbers to tenant-specific OpenClaw extension endpoints.

Possible backend options:
	•	JSON file for MVP
	•	PostgreSQL for production
	•	Redis cache optional for lookup speed

C. OpenClaw Router Extension
A lightweight service deployed per OpenClaw instance.

Responsibilities:
	•	accept router inbound payload
	•	authenticate router request
	•	transform payload into OpenClaw-compatible input
	•	call local OpenClaw API / webhook / internal handler
	•	return normalized outbound response(s)

D. OpenClaw Deployment
Each tenant has its own OpenClaw deployment in Kubernetes, ideally its own pod/service.

E. Admin / Control APIs
Used for:
	•	registering sender numbers
	•	updating tenant mappings
	•	enabling/disabling tenants
	•	viewing status
	•	resending failed messages
	•	checking logs or queue state

5. Recommended Stack

Router
	•	Node.js
	•	TypeScript
	•	Express or Fastify
	•	Baileys
	•	Pino logger
	•	Axios or native fetch
	•	Zod for validation

Storage
	•	MVP: JSON file
	•	Preferred production: PostgreSQL
	•	Optional cache: Redis

Messaging / reliability
	•	Initial MVP: synchronous HTTP
	•	Recommended production: NATS / Redis streams / queue-backed retry

Deployment
	•	Docker
	•	Kubernetes
	•	ConfigMap + Secret
	•	readiness/liveness probes

Testing
	•	Vitest or Jest
	•	Supertest for API tests
	•	mocked Baileys layer
	•	mocked extension endpoints

6. Repository Structure

openclaw-whatsapp-router/
├─ README.md
├─ package.json
├─ tsconfig.json
├─ .env.example
├─ .gitignore
├─ Dockerfile
├─ docker-compose.yml
├─ tenant-registry.json
├─ src/
│  ├─ index.ts
│  ├─ config/
│  │  └─ env.ts
│  ├─ logger/
│  │  └─ logger.ts
│  ├─ types/
│  │  ├─ tenant.ts
│  │  ├─ inbound.ts
│  │  ├─ outbound.ts
│  │  └─ router.ts
│  ├─ utils/
│  │  ├─ normalizePhone.ts
│  │  ├─ id.ts
│  │  └─ errors.ts
│  ├─ registry/
│  │  ├─ tenantRegistry.ts
│  │  ├─ jsonRegistry.ts
│  │  └─ postgresRegistry.ts
│  ├─ services/
│  │  ├─ baileysClient.ts
│  │  ├─ routerService.ts
│  │  ├─ extensionClient.ts
│  │  ├─ messageStore.ts
│  │  └─ retryService.ts
│  ├─ routes/
│  │  ├─ health.ts
│  │  ├─ admin.ts
│  │  ├─ outbound.ts
│  │  └─ registry.ts
│  └─ middleware/
│     ├─ auth.ts
│     └─ errorHandler.ts
├─ extension/
│  ├─ package.json
│  ├─ tsconfig.json
│  ├─ Dockerfile
│  ├─ .env.example
│  └─ src/
│     ├─ index.ts
│     ├─ types.ts
│     ├─ openclawClient.ts
│     └─ routes/
│        └─ inbound.ts
├─ tests/
│  ├─ unit/
│  │  ├─ normalizePhone.test.ts
│  │  ├─ tenantRegistry.test.ts
│  │  ├─ routerService.test.ts
│  │  └─ extensionClient.test.ts
│  └─ integration/
│     ├─ health.test.ts
│     ├─ outbound.test.ts
│     └─ inbound-routing.test.ts
└─ k8s/
   ├─ router/
   │  ├─ deployment.yaml
   │  ├─ service.yaml
   │  ├─ configmap.yaml
   │  ├─ secret.yaml
   │  └─ ingress.yaml
   └─ extension/
      ├─ deployment.yaml
      ├─ service.yaml
      ├─ configmap.yaml
      └─ secret.yaml

7. Data Model

Tenant registry model

{
  "tenantId": "tenant-a",
  "senderNumbers": ["919812345678", "919900001111"],
  "openclawExtensionUrl": "http://tenant-a-openclaw-extension:8090/router/inbound",
  "enabled": true,
  "metadata": {
    "agentId": "default",
    "environment": "prod"
  }
}

Inbound router event

{
  "messageId": "wamid-123",
  "sender": "919812345678",
  "routerNumber": "14150000000",
  "text": "hello",
  "timestamp": "2026-03-28T10:30:00Z",
  "type": "text"
}

Router to extension request

{
  "tenantId": "tenant-a",
  "messageId": "wamid-123",
  "sender": "919812345678",
  "routerNumber": "14150000000",
  "text": "hello",
  "timestamp": "2026-03-28T10:30:00Z",
  "type": "text",
  "metadata": {
    "source": "whatsapp-router"
  }
}

Extension to router response

{
  "recipient": "919812345678",
  "messages": [
    {
      "type": "text",
      "text": "Hi, how can I help?"
    }
  ],
  "replyToMessageId": "wamid-123"
}

8. Routing Logic

Sender-number-based routing

The primary routing key is:
	•	sender phone number

Example:
	•	919812345678 → tenant-a
	•	919900001111 → tenant-b

Fallback behavior

If sender not found:
	•	return configurable behavior:
	•	reject silently
	•	send “number not registered”
	•	route to default tenant
	•	queue for admin approval

For MVP:
	•	send “This number is not registered for this service.”

9. Router Service Requirements

Baileys integration

The router must:
	•	initialize Baileys with multi-file auth state
	•	support QR scan on first login
	•	persist auth
	•	reconnect on disconnect
	•	receive messages.upsert
	•	ignore self messages
	•	normalize text payloads first
	•	structure code so media support can be added later

Message handling

For each inbound message:
	1.	validate event
	2.	normalize sender number
	3.	lookup tenant
	4.	call extension
	5.	validate response
	6.	send outbound reply through Baileys
	7.	log success/failure
	8.	store message metadata

Outbound sending

Router must support:
	•	text send
	•	optional reply correlation
	•	retry on temporary failure
	•	logging of outbound send result

10. OpenClaw Extension Requirements

This is a custom connector/adapter service deployed per tenant.

Responsibilities
	•	expose POST /router/inbound
	•	authenticate request using shared secret or signed token
	•	validate payload
	•	call local OpenClaw endpoint
	•	transform OpenClaw output into router response format
	•	return list of messages to router

MVP assumption

If OpenClaw internal API is not finalized, define an abstraction layer:

interface OpenClawClient {
  sendInboundMessage(payload: RouterInboundPayload): Promise<ExtensionOutboundResponse>
}

Extension endpoints

POST /router/inbound
Used by router to send inbound messages to tenant

GET /health
Health check

GET /ready
Optional readiness check

11. Security Model

Router to extension auth

Use one of:
	•	shared secret header
	•	signed JWT
	•	mTLS in production

For MVP:
	•	x-router-secret: <secret>

Validation

Validate:
	•	sender format
	•	required text/message fields
	•	tenant enabled state
	•	extension URL allowlist if needed

Isolation
	•	each OpenClaw extension only serves its tenant
	•	no cross-tenant registry leakage
	•	logs must include tenantId

12. Session Model

OpenClaw session scope should be per sender.

Recommended session concept:
	•	one conversation/session per WhatsApp sender number per tenant

Do not create one global shared session.

13. API Requirements

Router endpoints

GET /health
Returns service liveness

GET /ready
Returns readiness status

POST /admin/tenants
Create tenant mapping

PUT /admin/tenants/:tenantId
Update tenant mapping

GET /admin/tenants
List tenants

POST /admin/outbound
Allow manual outbound send for testing

GET /admin/messages/:id
Inspect stored message metadata

14. Observability

Logging

Use structured logs with:
	•	timestamp
	•	tenantId
	•	sender
	•	messageId
	•	direction
	•	result
	•	latency

Metrics

Expose:
	•	inbound message count
	•	outbound send count
	•	routing failures
	•	unknown senders
	•	extension latency
	•	retry count
	•	Baileys connection state

Tracing

Optional in later phase:
	•	OpenTelemetry

15. Error Handling

Must handle
	•	tenant not found
	•	extension unavailable
	•	OpenClaw timeout
	•	Baileys disconnected
	•	invalid payload
	•	outbound send failure
	•	duplicate inbound message

Retry rules

Retry only for transient failures:
	•	extension timeout
	•	temporary network issue
	•	Baileys temporary disconnect

Do not retry:
	•	invalid sender
	•	unknown tenant
	•	validation failure

16. Duplicate Protection

Store recent inbound message IDs.

If same message ID already processed:
	•	skip duplicate handling
	•	log duplicate detection

MVP can use in-memory cache.
Production should use Redis or DB.

17. Persistence

MVP
	•	tenant registry in JSON
	•	message processing cache in memory
	•	auth state on disk

Production
	•	PostgreSQL for tenant registry and message audit
	•	Redis for dedupe and retry queue
	•	persistent volume for auth state if needed

18. Docker Requirements

Router container
	•	Node 20 or newer
	•	small production image
	•	mounted auth volume
	•	env-based config

Extension container
	•	separate Dockerfile
	•	configurable OpenClaw base URL
	•	secret-based auth header validation

19. Kubernetes Requirements

Router
	•	Deployment
	•	Service
	•	ConfigMap
	•	Secret
	•	PVC for auth state if needed
	•	liveness and readiness probes

Extension
	•	one Deployment per tenant
	•	one Service per tenant
	•	optional per-tenant ConfigMap and Secret

Example pattern
	•	namespace: router-system
	•	namespace: tenant-a
	•	namespace: tenant-b

20. Testing Requirements

Unit tests
	•	phone normalization
	•	tenant lookup
	•	unknown tenant handling
	•	extension response validation
	•	retry decision logic

Integration tests
	•	health endpoint
	•	admin create/list tenant
	•	inbound message routed to correct extension
	•	extension returns message and router sends outbound
	•	unregistered sender rejected

Mocking requirements
	•	mock Baileys socket
	•	mock extension HTTP server
	•	mock OpenClaw client

21. MVP Deliverables

Codex should produce all of the following:

Router service
	•	working Node.js TypeScript app
	•	Baileys integration
	•	sender-based routing
	•	outbound send support
	•	health endpoints
	•	structured logging

OpenClaw extension
	•	working mockable extension service
	•	inbound endpoint
	•	local OpenClaw client abstraction
	•	health endpoint

Registry
	•	JSON-backed tenant registry
	•	admin CRUD endpoints for tenant mappings

Deployment
	•	Dockerfile
	•	docker-compose
	•	K8s manifests

Tests
	•	unit tests
	•	integration tests

Docs
	•	README with run instructions
	•	env documentation
	•	architecture section
	•	sample curl commands

22. Non-goals for MVP

Do not implement initially:
	•	media routing
	•	voice notes
	•	multi-router HA clustering
	•	official WhatsApp Business API integration
	•	UI dashboard
	•	full DB migration framework
	•	advanced RBAC UI
	•	analytics dashboard

23. Future Enhancements

Planned later:
	•	media support
	•	PostgreSQL registry backend
	•	Redis queue and dedupe
	•	Web admin UI
	•	OpenTelemetry tracing
	•	rate limiting
	•	multi-router failover
	•	sender onboarding approval workflow
	•	tenant quotas
	•	message templates
	•	audit export

24. Build Instructions for Codex

Tell Codex to:
	1.	build the full repository from scratch in TypeScript
	2.	use Baileys as the WhatsApp layer
	3.	make the router own all inbound and outbound messaging
	4.	create a separate extension/ service for OpenClaw connector logic
	5.	keep tenant routing based on sender number
	6.	provide mocked OpenClaw integration if actual OpenClaw API is unavailable
	7.	include tests, Docker, and Kubernetes manifests
	8.	keep code modular and production-oriented
	9.	support JSON registry first, with interfaces allowing PostgreSQL later
	10.	keep all secrets and URLs configurable via environment variables

25. Codex Prompt

Paste this to Codex:

Build a production-structured MVP for a project named Openclaw-whatsapp-router.

Goal:
Create a WhatsApp router platform using Baileys where one router WhatsApp number receives all inbound messages, routes each inbound sender number to a tenant-specific OpenClaw deployment via a custom extension, receives the response from that extension, and sends the outbound response back through the same router number.

Requirements:
- Node.js + TypeScript
- Baileys for WhatsApp Web integration
- Express or Fastify
- JSON-backed tenant registry for MVP
- Separate extension service under /extension
- Router-to-extension auth via shared secret header
- Health endpoints
- Admin APIs for managing tenant mappings
- Structured logging
- Unit and integration tests
- Dockerfile + docker-compose
- Kubernetes manifests
- README with architecture and run instructions

Key routing rule:
sender phone number -> tenant mapping -> extension endpoint -> OpenClaw -> extension response -> router outbound send

Important:
- The visible WhatsApp identity must always remain the single router number
- This is not a multi-number outbound system
- Use interfaces so PostgreSQL and Redis can be added later
- Include duplicate protection design
- Keep code modular and clean
- Include mocked OpenClaw client behavior if actual OpenClaw API is not available

Create the full folder structure, code, tests, env files, and deployment assets.

If you want, I can turn this into a cleaner BRD + technical design doc format next.
