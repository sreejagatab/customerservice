# Multi-stage build for Auth Service
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY auth-service/package*.json ./auth-service/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy source code
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/shared/node_modules ./shared/node_modules
COPY --from=deps /app/auth-service/node_modules ./auth-service/node_modules

# Build shared package first
RUN cd shared && npm run build

# Build auth service
RUN cd auth-service && npm run build

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 authservice

# Copy built application
COPY --from=builder --chown=authservice:nodejs /app/shared/dist ./shared/dist
COPY --from=builder --chown=authservice:nodejs /app/shared/package.json ./shared/
COPY --from=builder --chown=authservice:nodejs /app/auth-service/dist ./auth-service/dist
COPY --from=builder --chown=authservice:nodejs /app/auth-service/package.json ./auth-service/

# Copy production dependencies
COPY --from=deps --chown=authservice:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=authservice:nodejs /app/shared/node_modules ./shared/node_modules
COPY --from=deps --chown=authservice:nodejs /app/auth-service/node_modules ./auth-service/node_modules

# Set user
USER authservice

# Expose port
EXPOSE 3001

# Set working directory to auth-service
WORKDIR /app/auth-service

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
