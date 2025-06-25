# Multi-stage build for Message Service
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY message-service/package*.json ./message-service/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy source code
COPY . .
COPY --from=deps /app/node_modules ./node_modules

# Build the application
RUN npm run build -w message-service

# Production image, copy all the files and run the application
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 messageservice

# Copy built application
COPY --from=builder --chown=messageservice:nodejs /app/message-service/dist ./dist
COPY --from=builder --chown=messageservice:nodejs /app/message-service/package*.json ./
COPY --from=deps --chown=messageservice:nodejs /app/node_modules ./node_modules

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3004
ENV SERVICE_NAME=message-service

# Expose port
EXPOSE 3004

# Switch to non-root user
USER messageservice

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3004/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
