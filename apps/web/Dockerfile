# Base image is pinned by digest (#1829), not by floating tag: `node:22-alpine`
# can move to a new patch/Alpine release between two builds, which is exactly
# how a vulnerable base image slips in without a diff anyone reviews. The
# digest below is the OCI image *index*, so it still resolves amd64 and arm64
# (multi-arch builds in .github/workflows/docker-build.yml keep working) and
# also pins whatever Node/Alpine patch level 22-alpine pointed at when the pin
# landed.
#
# To bump: resolve the new index digest for the tag you want, change it here,
# and let the Trivy image scan in the Docker Build workflow adjudicate the new
# base — do not silence a red scan by widening .trivyignore.yaml.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS base
WORKDIR /app

RUN npm install -g pnpm@10.30.2

# NOTE: the build context is the repository root (see docker-build.yml), not
# apps/web — since the pnpm workspace migration (#1715) the lockfile,
# workspace manifest, and root package.json live at the root and COPY cannot
# reach outside the context.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/package.json
# The store lives inside /app so later stages can COPY it over: the default
# global store does not survive across stages. Fetch everything (prod and
# dev) because builder/dev run a full install, not --prod.
RUN pnpm fetch --store-dir /app/.pnpm-store

FROM base AS dev
COPY --from=deps /app/.pnpm-store /app/.pnpm-store
COPY --from=deps /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=deps /app/apps/web/package.json ./apps/web/package.json
COPY . .
RUN pnpm install --offline --store-dir /app/.pnpm-store
EXPOSE 3000
CMD ["pnpm", "run", "dev"]

FROM base AS builder
COPY --from=deps /app/.pnpm-store /app/.pnpm-store
COPY --from=deps /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=deps /app/apps/web/package.json ./apps/web/package.json
COPY . .
RUN pnpm install --offline --store-dir /app/.pnpm-store
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
# With output: "standalone" in a pnpm workspace, the traced output nests the
# app directory: server.js lives at apps/web/server.js, not at the root.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
WORKDIR /app/apps/web
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
