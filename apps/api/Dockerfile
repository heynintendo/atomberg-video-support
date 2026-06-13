# Build context is the repository root (see infra/docker-compose.yml) so the
# workspace and the shared package resolve correctly.
FROM node:22-bookworm-slim

WORKDIR /app

# OpenSSL + CA certs are required by the Prisma query engine at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies from the workspace manifests first for better layer caching.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

# Copy the source the API actually needs.
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

# Generate the Prisma client for the container's platform.
RUN npm run db:generate -w @atomquest/api

EXPOSE 8080
WORKDIR /app/apps/api

# Apply committed migrations, then start the server.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/index.ts"]
