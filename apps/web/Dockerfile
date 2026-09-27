FROM node:22-alpine AS base
WORKDIR /app

RUN npm install -g pnpm@10.30.2

FROM base AS deps
COPY pnpm-lock.yaml ./
RUN pnpm fetch --prod

FROM base AS dev
COPY --from=deps /app/pnpm-lock.yaml ./
COPY . .
RUN pnpm install --offline
EXPOSE 3000
CMD ["pnpm", "run", "dev"]

FROM base AS builder
COPY --from=deps /app/pnpm-lock.yaml ./
COPY . .
RUN pnpm install --offline
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
