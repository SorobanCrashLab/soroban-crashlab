# SLSA Verifier for CrashLab
# 
# Provides slsa-verifier for verifying SLSA provenance attestations.

FROM golang:1.22 AS builder

ARG SLSA_VERIFIER_VERSION=v2.5.0
RUN go install github.com/slsa-framework/slsa-verifier/v2/cli/slsa-verifier@${SLSA_VERIFIER_VERSION}

FROM gcr.io/distroless/base-debian12

COPY --from=builder /go/bin/slsa-verifier /usr/local/bin/slsa-verifier

# Create non-root user
RUN groupadd -g 1000 verifier && \
    useradd -u 1000 -g 1000 -m -s /bin/bash verifier

USER verifier
WORKDIR /home/verifier

ENTRYPOINT ["slsa-verifier"]
CMD ["--help"]