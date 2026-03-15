# Build context: workspace root (JaskierWorkspace/)
# fly deploy must be run from workspace root, or fly.toml must set build.context
#
# Equivalent to: docker build --build-arg APP_NAME=ClaudeHydra --build-arg PKG_NAME=claudehydra-backend --build-arg APP_PORT=8082 -f docker/Dockerfile.backend .
# This app-specific Dockerfile is kept for Fly.io compatibility (fly.toml references it directly).

# ── Stage 1: cargo-chef base ──
# Note: "latest-rust-1" pins to the latest Rust 1.x toolchain within the cargo-chef image.
# The `chef` alias below references this pinned base — not an untagged `:latest`.
FROM lukemathwalker/cargo-chef:latest-rust-1 AS chef
WORKDIR /app

# ── Stage 2: Planner — generate recipe from workspace manifests only ──
FROM chef AS planner
# Copy workspace-level manifests
COPY Cargo.toml Cargo.lock ./
# Copy ALL shared crate manifests (src not needed for recipe generation)
COPY crates/jaskier-core/Cargo.toml ./crates/jaskier-core/Cargo.toml
COPY crates/jaskier-ai-modules/Cargo.toml ./crates/jaskier-ai-modules/Cargo.toml
COPY crates/jaskier-browser/Cargo.toml ./crates/jaskier-browser/Cargo.toml
COPY crates/jaskier-browser-pool/Cargo.toml ./crates/jaskier-browser-pool/Cargo.toml
COPY crates/jaskier-tools/Cargo.toml ./crates/jaskier-tools/Cargo.toml
COPY crates/jaskier-db/Cargo.toml ./crates/jaskier-db/Cargo.toml
COPY crates/jaskier-memory/Cargo.toml ./crates/jaskier-memory/Cargo.toml
COPY crates/jaskier-oauth/Cargo.toml ./crates/jaskier-oauth/Cargo.toml
COPY crates/jaskier-imaging/Cargo.toml ./crates/jaskier-imaging/Cargo.toml
COPY crates/jaskier-hydra-state/Cargo.toml ./crates/jaskier-hydra-state/Cargo.toml
COPY crates/jaskier-integration-tests/Cargo.toml ./crates/jaskier-integration-tests/Cargo.toml
COPY crates/worklog-api/Cargo.toml ./crates/worklog-api/Cargo.toml
# New crates added since last deploy (Task 14-34):
COPY crates/jaskier-collab/Cargo.toml ./crates/jaskier-collab/Cargo.toml
COPY crates/jaskier-swarm/Cargo.toml ./crates/jaskier-swarm/Cargo.toml
COPY crates/jaskier-vault/Cargo.toml ./crates/jaskier-vault/Cargo.toml
COPY crates/jaskier-sandbox/Cargo.toml ./crates/jaskier-sandbox/Cargo.toml
COPY crates/jaskier-memory-pruning/Cargo.toml ./crates/jaskier-memory-pruning/Cargo.toml
COPY crates/jaskier-model-router/Cargo.toml ./crates/jaskier-model-router/Cargo.toml
COPY crates/jaskier-session-auth/Cargo.toml ./crates/jaskier-session-auth/Cargo.toml
COPY crates/jaskier-semantic-cache/Cargo.toml ./crates/jaskier-semantic-cache/Cargo.toml
COPY crates/jaskier-graph/Cargo.toml ./crates/jaskier-graph/Cargo.toml
COPY crates/jaskier-wasm-core/Cargo.toml ./crates/jaskier-wasm-core/Cargo.toml
# Copy ALL app backend manifests (workspace members -- cargo metadata requires all present)
COPY ClaudeHydra/backend/Cargo.toml ./apps/ClaudeHydra/backend/Cargo.toml
COPY apps/GeminiHydra/backend/Cargo.toml ./apps/GeminiHydra/backend/Cargo.toml
COPY apps/Tissaia/backend/Cargo.toml ./apps/Tissaia/backend/Cargo.toml
COPY apps/OpenAIHydra/backend/Cargo.toml ./apps/OpenAIHydra/backend/Cargo.toml
COPY apps/GrokHydra/backend/Cargo.toml ./apps/GrokHydra/backend/Cargo.toml
COPY apps/DeepSeekHydra/backend/Cargo.toml ./apps/DeepSeekHydra/backend/Cargo.toml
COPY apps/LocalHydra/backend/Cargo.toml ./apps/LocalHydra/backend/Cargo.toml
COPY apps/Regis/backend/Cargo.toml ./apps/Regis/backend/Cargo.toml
COPY apps/FitPlanner67/backend/Cargo.toml ./apps/FitPlanner67/backend/Cargo.toml
COPY apps/Vesemir/Cargo.toml ./apps/Vesemir/Cargo.toml
COPY apps/JaskierTUI/Cargo.toml ./apps/JaskierTUI/Cargo.toml
# Copy service workspace member manifests (.dockerignore excludes services/, so copy explicitly)
COPY services/gemini-proxy-rs/Cargo.toml ./services/gemini-proxy-rs/Cargo.toml
COPY services/JaskierRAG/proxy/Cargo.toml ./services/JaskierRAG/proxy/Cargo.toml
COPY services/jaskier-auto-scaler/Cargo.toml ./services/jaskier-auto-scaler/Cargo.toml
COPY services/jaskier-cli/Cargo.toml ./services/jaskier-cli/Cargo.toml
COPY services/jaskier-vault-mcp/Cargo.toml ./services/jaskier-vault-mcp/Cargo.toml
# Stub out ALL workspace members (src stubs needed for cargo chef prepare)
RUN for pkg in ClaudeHydra GeminiHydra Tissaia OpenAIHydra GrokHydra DeepSeekHydra LocalHydra Regis FitPlanner67; do \
      mkdir -p apps/$pkg/backend/src && \
      echo 'fn main() {}' > apps/$pkg/backend/src/main.rs; \
    done && \
    mkdir -p apps/Vesemir/src && \
    echo 'fn main() {}' > apps/Vesemir/src/main.rs && \
    mkdir -p apps/JaskierTUI/src && \
    echo 'fn main() {}' > apps/JaskierTUI/src/main.rs && \
    for svc in gemini-proxy-rs jaskier-auto-scaler jaskier-cli jaskier-vault-mcp; do \
      mkdir -p services/$svc/src && \
      echo 'fn main() {}' > services/$svc/src/main.rs; \
    done && \
    mkdir -p services/JaskierRAG/proxy/src && \
    echo 'fn main() {}' > services/JaskierRAG/proxy/src/main.rs && \
    for crate in jaskier-core jaskier-ai-modules jaskier-browser jaskier-browser-pool \
                 jaskier-tools jaskier-db jaskier-memory jaskier-oauth jaskier-imaging \
                 jaskier-hydra-state jaskier-integration-tests worklog-api \
                 jaskier-collab jaskier-swarm jaskier-vault jaskier-sandbox \
                 jaskier-memory-pruning jaskier-model-router jaskier-session-auth \
                 jaskier-semantic-cache jaskier-graph jaskier-wasm-core; do \
      mkdir -p crates/$crate/src && \
      echo 'fn main() {}' > crates/$crate/src/lib.rs; \
    done
RUN cargo chef prepare --recipe-path recipe.json

# ── Stage 3: Builder — cook deps (cached), then compile ──
FROM chef AS builder
# Environment: disable incremental compilation (not useful in Docker, wastes space)
ENV CARGO_INCREMENTAL=0
COPY --from=planner /app/recipe.json recipe.json
# Cook all workspace dependencies — layer cached until Cargo.toml/Cargo.lock change
RUN cargo chef cook --release -p claudehydra-backend --recipe-path recipe.json
# Now copy the real source (after cook — source changes don't bust the deps layer)
COPY Cargo.toml Cargo.lock ./
COPY crates/ ./crates/
COPY ClaudeHydra/backend/Cargo.toml ./apps/ClaudeHydra/backend/Cargo.toml
COPY ClaudeHydra/backend/src ./apps/ClaudeHydra/backend/src
COPY ClaudeHydra/backend/migrations ./apps/ClaudeHydra/backend/migrations
# Note: tests/ excluded by .dockerignore — not needed for production binary builds
# Stub the other workspace members (src only, Cargo.toml already in recipe)
RUN for pkg in GeminiHydra Tissaia OpenAIHydra GrokHydra DeepSeekHydra LocalHydra Regis FitPlanner67; do \
      mkdir -p apps/$pkg/backend/src && \
      echo 'fn main() {}' > apps/$pkg/backend/src/main.rs; \
    done && \
    mkdir -p apps/Vesemir/src && \
    echo 'fn main() {}' > apps/Vesemir/src/main.rs && \
    mkdir -p apps/JaskierTUI/src && \
    echo 'fn main() {}' > apps/JaskierTUI/src/main.rs && \
    for svc in gemini-proxy-rs jaskier-auto-scaler jaskier-cli jaskier-vault-mcp; do \
      mkdir -p services/$svc/src && \
      echo 'fn main() {}' > services/$svc/src/main.rs; \
    done && \
    mkdir -p services/JaskierRAG/proxy/src && \
    echo 'fn main() {}' > services/JaskierRAG/proxy/src/main.rs
RUN cargo build --release -p claudehydra-backend --bin claudehydra-backend --bin migrate-credentials-to-vault

# ── Stage 4: Minimal runtime ──
FROM debian:trixie-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/claudehydra-backend /usr/local/bin/app
COPY --from=builder /app/target/release/migrate-credentials-to-vault /usr/local/bin/
COPY ClaudeHydra/backend/migrations ./migrations
# Skarbiec Krasnali: Credentials now managed by Jaskier Vault.
# These env vars are optional fallbacks — Vault is the primary credential source.
# ANTHROPIC_API_KEY, GOOGLE_API_KEY, AUTH_SECRET — set via `fly secrets set` or Vault.
ENV PORT=8082
EXPOSE 8082
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8082/api/health || exit 1
USER 1000
CMD ["app"]
