# Build context is the workspace root (`contracts/`), so the workspace manifest
# and the shared Cargo.lock are available to the builder.
FROM rust:1-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY crashlab-core/Cargo.toml ./crashlab-core/Cargo.toml
COPY crashlab-core/src ./crashlab-core/src
COPY crashlab-core/tests ./crashlab-core/tests
COPY soroban-example/Cargo.toml ./soroban-example/Cargo.toml
COPY soroban-example/src ./soroban-example/src
RUN cargo test --workspace --all-targets --release

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/crashlab /usr/local/bin/crashlab
COPY --from=builder /app/target/release/replay-single-seed /usr/local/bin/replay-single-seed
ENTRYPOINT ["crashlab"]
