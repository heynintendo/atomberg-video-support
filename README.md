# AtomQuest 1.0 — Real-Time Video Support Platform

A browser-based video support platform where a support agent and a customer hold
a live audio/video call with in-call chat. All real-time media is relayed
through a self-hosted LiveKit SFU on our own infrastructure — there is no
client-to-client media path and no third-party hosted video API.

The media spine is deployed and proven across networks (including a forced TURN
relay over TLS for UDP-blocked venues). Agents sign in, create sessions, and
share signed single-session invite links; customers join via those links. Roles
are enforced server-side and reflected in LiveKit grants.

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

## Roles & session lifecycle

There are two roles, with asymmetric access enforced server-side:

- **Agent** — signs in (one-click demo identity, or Microsoft Entra SSO as an
  additive option). Can create sessions, generate invite links, join, manage the
  room, and record. LiveKit grant includes room admin/create/record.
- **Customer** — never signs in. Joins only via a signed, single-session invite
  link the agent shares. The invite is scoped to one session, allows the same
  customer to reconnect within that session, and is rejected once it expires or
  the session ends — it is not a permanent re-entry link. LiveKit grant is
  join-only.

A session flows: agent creates session → shares invite → customer joins →
presence is tracked live → the call is ended by one of two distinct actions:

- **Customer "Leave"** closes only that customer's own connection. The session
  stays active for everyone else.
- **Agent "End session"** terminates the room for all participants and marks the
  session `ended`.

**Live presence** is read from LiveKit RoomService `ListParticipants`, which is
the authoritative source for who is currently in the room. Presence has three
states — `present` / `reconnecting` / `left`. Webhooks (`participant_joined/left`,
`room_started/finished`) feed only the historical event log and the participant
join/leave timeline, never the live view.

**Reconciliation sweep:** on an interval and after each presence poll, the server
diffs the authoritative RoomService list against open participant rows and
converges them — closing anyone who has left and recording anyone present but
missing. This backstops any dropped webhook, so no participant is ever stuck
"in the call" and the history stays accurate. Session history (who joined, when,
and for how long) is queryable per session.

## Quality gates

```bash
npm run typecheck      # tsc --noEmit across all workspaces
npm run lint           # eslint
```

Architecture diagram, the organizer's written approval, and the full operations
guide are added in the deliverables phase.
