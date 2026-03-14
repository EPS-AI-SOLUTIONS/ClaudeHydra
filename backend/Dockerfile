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
# Copy shared crate manifests only (src not needed for recipe generation)
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
# Copy this app's manifest
COPY apps/ClaudeHydra/backend/Cargo.toml ./apps/ClaudeHydra/backend/Cargo.toml
# Stub out all workspace members (src stubs needed for cargo chef prepare)
RUN for pkg in ClaudeHydra GeminiHydra Tissaia OpenAIHydra GrokHydra DeepSeekHydra Regis FitPlanner67; do \
      mkdir -p apps/$pkg/backend/src && \
      echo 'fn main() {}' > apps/$pkg/backend/src/main.rs; \
    done && \
    mkdir -p apps/Vesemir/src && \
    echo 'fn main() {}' > apps/Vesemir/src/main.rs && \
    for crate in jaskier-core jaskier-ai-modules jaskier-browser jaskier-browser-pool \
                 jaskier-tools jaskier-db jaskier-memory jaskier-oauth jaskier-imaging \
                 jaskier-hydra-state jaskier-integration-tests worklog-api; do \
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
COPY apps/ClaudeHydra/backend/Cargo.toml ./apps/ClaudeHydra/backend/Cargo.toml
COPY apps/ClaudeHydra/backend/src ./apps/ClaudeHydra/backend/src
COPY apps/ClaudeHydra/backend/migrations ./apps/ClaudeHydra/backend/migrations
COPY apps/ClaudeHydra/backend/tests ./apps/ClaudeHydra/backend/tests
# Stub the other workspace members (src only, Cargo.toml already in recipe)
RUN for pkg in GeminiHydra Tissaia OpenAIHydra GrokHydra DeepSeekHydra Regis FitPlanner67; do \
      mkdir -p apps/$pkg/backend/src && \
      echo 'fn main() {}' > apps/$pkg/backend/src/main.rs; \
    done && \
    mkdir -p apps/Vesemir/src && \
    echo 'fn main() {}' > apps/Vesemir/src/main.rs
RUN cargo build --release -p claudehydra-backend --bin claudehydra-backend --bin migrate-credentials-to-vault

# ── Stage 4: Minimal runtime ──
FROM debian:trixie-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/claudehydra-backend /usr/local/bin/app
COPY --from=builder /app/target/release/migrate-credentials-to-vault /usr/local/bin/
COPY apps/ClaudeHydra/backend/migrations ./migrations
# Skarbiec Krasnali: Credentials now managed by Jaskier Vault.
# These env vars are optional fallbacks — Vault is the primary credential source.
# ANTHROPIC_API_KEY, GOOGLE_API_KEY, AUTH_SECRET — set via `fly secrets set` or Vault.
ENV PORT=8082
EXPOSE 8082
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8082/api/health || exit 1
USER 1000
CMD ["app"]
