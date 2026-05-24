# syntax=docker/dockerfile:1
#
# Portable container for the Hono server (apps/server).
# Runs anywhere that injects $PORT: Cloud Run, Railway, Fly.io, a plain VM, etc.
# The app listens on $PORT — see apps/server/src/main.ts.
#
#   docker build -t server .
#   docker run -p 8080:8080 --env-file apps/server/.env server

# ---------- Builder ----------
FROM oven/bun:1.2.19 AS builder
WORKDIR /app

# Install the whole workspace (lockfile-pinned) so tsdown can bundle the server.
# .dockerignore keeps node_modules/dist/.next out of the build context.
COPY . .
RUN bun install --frozen-lockfile

# tsdown inlines the @boilerplate/* workspace packages; external npm deps
# (hono, better-auth, @trpc/server, …) stay in node_modules.
RUN bun run --filter server build

# ---------- Runtime ----------
FROM oven/bun:1.2.19-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# The bundle plus the external deps it imports at runtime. Bun resolves bare
# imports by walking up to /app/node_modules.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json

# Default for hosts that don't inject PORT; Cloud Run/Railway override it,
# Fly maps it via internal_port in fly.toml.
ENV PORT=8080
EXPOSE 8080

# Run as the non-root user bundled in the oven/bun image.
USER bun

CMD ["bun", "run", "apps/server/dist/main.mjs"]
