# ClamAV Scanner for CrashLab
# 
# Provides ClamAV daemon (clamd) for malware scanning of artifacts.

FROM ubuntu:24.04

# Install ClamAV
RUN apt-get update && apt-get install -y --no-install-recommends \
    clamav \
    clamav-daemon \
    clamav-freshclam \
    && rm -rf /var/lib/apt/lists/*

# Create clamav user and directories
RUN mkdir -p /var/lib/clamav /var/run/clamav /var/log/clamav && \
    chown -R clamav:clamav /var/lib/clamav /var/run/clamav /var/log/clamav

# Copy configuration files
COPY clamd.conf /etc/clamav/clamd.conf
COPY freshclam.conf /etc/clamav/freshclam.conf

# Update virus definitions
RUN freshclam --config-file=/etc/clamav/freshclam.conf

# Expose clamd port
EXPOSE 3310

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD clamdscan --config-file=/etc/clamav/clamd.conf --fdpass /dev/null || exit 1

# Run as clamav user
USER clamav

# Entry point
ENTRYPOINT ["clamd", "--config-file=/etc/clamav/clamd.conf", "--foreground"]