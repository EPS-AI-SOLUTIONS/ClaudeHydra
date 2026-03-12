# Build context: workspace root (JaskierWorkspace/)
# fly deploy must be run from workspace root, or fly.toml must set build.context
#
# Equivalent to: docker build --build-arg APP_NAME=ClaudeHydra --build-arg PKG_NAME=claudehydra-backend --build-arg APP_PORT=8082 -f docker/Dockerfile.backend .
# This app-specific Dockerfile is kept for Fly.io compatibility (fly.toml references it directly).

# ── Stage 1: cargo-chef base ──
FROM lukemathwalker/cargo-chef:latest-rust-1 AS chef
WORKDIR /app

# ── Stage 2: Planner — generate recipe from full workspace ──
FROM chef AS planner
# Copy workspace-level manifests
COPY Cargo.toml Cargo.lock ./
# Copy all shared crates (manifests + src)
COPY crates/ ./crates/
# Copy this app's backend
COPY apps/ClaudeHydra/backend/Cargo.toml ./apps/ClaudeHydra/backend/Cargo.toml
COPY apps/ClaudeHydra/backend/src ./apps/ClaudeHydra/backend/src
# Stub out other workspace members so Cargo can resolve the full workspace graph
RUN for pkg in GeminiHydra Tissaia OpenAIHydra GrokHydra DeepSeekHydra Regis; do \
      mkdir -p apps/$pkg/backend/src && \
      echo 'fn main() {}' > apps/$pkg/backend/src/main.rs; \
    done
RUN cargo chef prepare --recipe-path recipe.json

# ── Stage 3: Builder — cook deps (cached), then compile ──
FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
# Cook all workspace dependencies — layer cached until Cargo.toml/Cargo.lock change
RUN cargo chef cook --release -p claudehydra-backend --recipe-path recipe.json
# Now copy the real source
COPY Cargo.toml Cargo.lock ./
COPY crates/ ./crates/
COPY apps/ClaudeHydra/backend/Cargo.toml ./apps/ClaudeHydra/backend/Cargo.toml
COPY apps/ClaudeHydra/backend/src ./apps/ClaudeHydra/backend/src
COPY apps/ClaudeHydra/backend/migrations ./apps/ClaudeHydra/backend/migrations
# Stub the other workspace members (src only, Cargo.toml already in recipe)
RUN for pkg in GeminiHydra Tissaia OpenAIHydra GrokHydra DeepSeekHydra Regis; do \
      mkdir -p apps/$pkg/backend/src && \
      echo 'fn main() {}' > apps/$pkg/backend/src/main.rs; \
    done
RUN cargo build --release -p claudehydra-backend

# ── Stage 4: Minimal runtime ──
FROM debian:trixie-slim AS runtime
RUN apt-get update && apt-get install -y ca-certificates curl git && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/claudehydra-backend /usr/local/bin/app
COPY apps/ClaudeHydra/backend/migrations ./migrations
ENV PORT=8082
EXPOSE 8082
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8082/api/health || exit 1
CMD ["app"]
