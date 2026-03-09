# ── Frontend build ────────────────────────────────────────────────────────────
FROM node:20-slim AS frontend

WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ── Rust build ────────────────────────────────────────────────────────────────
FROM rust:1.93-bookworm AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends pkg-config libssl-dev cmake \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifest + lock for dependency caching
COPY Cargo.toml ./
COPY Cargo.lock* ./

# Stub src so cargo can compile deps without real code
RUN mkdir -p src && echo 'fn main(){}' > src/main.rs
COPY migrations migrations
RUN cargo build --release

# Replace stub with real source and rebuild
RUN rm src/main.rs
COPY src src
RUN touch src/main.rs && cargo build --release

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/dispatch-ota /usr/local/bin/server
COPY --from=frontend /app/web/dist ./web/dist
COPY migrations ./migrations

ENV STATIC_DIR=/app/web/dist

EXPOSE 9999
CMD ["/usr/local/bin/server"]
