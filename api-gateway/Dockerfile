# Multi-stage build for API Gateway
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY api-gateway/package*.json ./api-gateway/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy source code
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/shared/node_modules ./shared/node_modules
COPY --from=deps /app/api-gateway/node_modules ./api-gateway/node_modules

# Build shared package first
RUN cd shared && npm run build

# Build api gateway
RUN cd api-gateway && npm run build

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 gateway

# Copy built application
COPY --from=builder --chown=gateway:nodejs /app/shared/dist ./shared/dist
COPY --from=builder --chown=gateway:nodejs /app/shared/package.json ./shared/
COPY --from=builder --chown=gateway:nodejs /app/api-gateway/dist ./api-gateway/dist
COPY --from=builder --chown=gateway:nodejs /app/api-gateway/package.json ./api-gateway/

# Copy production dependencies
COPY --from=deps --chown=gateway:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=gateway:nodejs /app/shared/node_modules ./shared/node_modules
COPY --from=deps --chown=gateway:nodejs /app/api-gateway/node_modules ./api-gateway/node_modules

# Set user
USER gateway

# Expose port
EXPOSE 3000

# Set working directory to api-gateway
WORKDIR /app/api-gateway

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
