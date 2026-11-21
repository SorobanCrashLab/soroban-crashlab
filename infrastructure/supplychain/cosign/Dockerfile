# Cosign for CrashLab
# 
# Provides cosign for Sigstore keyless signing and verification.

FROM golang:1.22 AS builder

ARG COSIGN_VERSION=v2.2.4
RUN go install github.com/sigstore/cosign/v2/cmd/cosign@${COSIGN_VERSION}

FROM gcr.io/distroless/base-debian12

COPY --from=builder /go/bin/cosign /usr/local/bin/cosign

# Create non-root user
RUN groupadd -g 1000 cosign && \
    useradd -u 1000 -g 1000 -m -s /bin/bash cosign

USER cosign
WORKDIR /home/cosign

ENTRYPOINT ["cosign"]
CMD ["--help"]