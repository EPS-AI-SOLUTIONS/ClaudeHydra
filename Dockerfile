# Syntax: docker/dockerfile:1
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HYDRA_DOCKER=true

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 hydra

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create data directories with permissions
RUN mkdir -p .hydra-data/logs .serena/memories && \
    chown -R hydra:nodejs .hydra-data .serena

USER hydra

EXPOSE 3000

CMD ["node", "src/server.js"]
