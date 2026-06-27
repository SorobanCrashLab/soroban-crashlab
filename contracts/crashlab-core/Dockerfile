FROM rust:1-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY tests ./tests
RUN cargo test --all-targets --release

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/crashlab /usr/local/bin/crashlab
COPY --from=builder /app/target/release/replay-single-seed /usr/local/bin/replay-single-seed
ENTRYPOINT ["crashlab"]
