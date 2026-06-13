# AtomQuest 1.0 — Real-Time Video Support Platform

A browser-based video support platform where a support agent and a customer hold
a live audio/video call with in-call chat. All real-time media is relayed
through a self-hosted LiveKit SFU on our own infrastructure — there is no
client-to-client media path and no third-party hosted video API.

This repository is built in risk-ordered phases. This is the Phase 0 foundation:
the monorepo, the persistence model, and the container topology.

## Layout

```
apps/
  api/        Fastify + TypeScript backend (livekit-server-sdk, Prisma)
  web/        React + Vite + TypeScript frontend (LiveKit hooks)
packages/
  shared/     Shared TypeScript API-contract types
infra/
  docker-compose.yml   postgres, redis, livekit (+ built-in TURN), egress, api
  livekit.yaml         LiveKit SFU configuration
  Caddyfile            Edge TLS termination for the Hetzner deployment
```

## Prerequisites

- Node.js 22+
- Docker with Compose v2+

## Local development

```bash
# 1. Install workspace dependencies
npm install

# 2. Configure environment
cp infra/.env.example infra/.env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 3. Bring up the stack (postgres, redis, livekit, egress, api)
npm run compose:up

# 4. Apply the database schema (first run)
npm run db:migrate

# 5. Start the web app
npm run dev:web        # http://localhost:5173
```

The API is served on `http://localhost:8080`; `GET /health` is a liveness check
and `GET /readyz` verifies the database connection.

## Quality gates

```bash
npm run typecheck      # tsc --noEmit across all workspaces
npm run lint           # eslint
```

Architecture diagram, the organizer's written approval, and the full operations
guide are added in the deliverables phase.
