# =============================================================================
# HYDRA GeminiCLI - Multi-Stage Dockerfile
# Optimized for layer caching and minimal image size
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies (cached layer)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

# Install only production dependencies first (better caching)
COPY package.json package-lock.json* ./

# Use npm ci for deterministic builds
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# -----------------------------------------------------------------------------
# Stage 2: Builder (includes devDependencies for build/test)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including dev)
RUN npm ci --ignore-scripts

# Copy source code
COPY src/ ./src/
COPY scripts/ ./scripts/

# Run linting and tests (optional - comment out for faster builds)
# RUN npm run lint && npm run test

# -----------------------------------------------------------------------------
# Stage 3: Production (minimal runtime image)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

# Security: run as non-root user
RUN addgroup -g 1001 -S hydra && \
    adduser -S gemini -u 1001 -G hydra

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY package.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/

# Copy optional config files if they exist
COPY .env.example .env.example

# Change ownership to non-root user
RUN chown -R gemini:hydra /app

# Switch to non-root user
USER gemini

# Expose MCP server port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Start the MCP server
CMD ["node", "src/server.js"]

# -----------------------------------------------------------------------------
# Stage 4: Development (with hot reload)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS development

WORKDIR /app

# Install all dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source
COPY . .

ENV NODE_ENV=development
ENV PORT=3000

EXPOSE 3000

# Development command with watch mode
CMD ["npm", "run", "start"]
