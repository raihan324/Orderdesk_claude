# syntax=docker/dockerfile:1

############################
# 1. Install dependencies  #
############################
FROM node:22-alpine AS deps
# libc6-compat helps Next.js' SWC binary on Alpine.
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

############################
# 2. Build the app         #
############################
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time, and
# AUTH_MODE drives the Content-Security-Policy generated in next.config.ts.
# They must therefore be present as build args (passed from docker-compose).
ARG AUTH_MODE
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL
ARG NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL
ENV AUTH_MODE=$AUTH_MODE \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_CLERK_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_URL \
    NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

############################
# 3. Production runner     #
############################
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as an unprivileged user.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Standalone output: a minimal server.js + only the node_modules it needs.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# OpenAPI spec, served at /api-docs/openapi by the Swagger UI route.
COPY --from=builder /app/docs/api/openapi.yaml ./docs/api/openapi.yaml

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
