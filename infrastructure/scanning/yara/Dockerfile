# YARA Scanner for CrashLab
# 
# Provides YARA pattern matching for artifact scanning.
# Includes custom rules for packers, cryptominers, and exploits.

FROM ubuntu:24.04

# Install YARA and dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    yara \
    libyara-dev \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install yara-python for Python bindings
RUN pip3 install --no-cache-dir yara-python

# Create yara user and directories
RUN groupadd -g 1000 yara && \
    useradd -u 1000 -g 1000 -m -s /bin/bash yara && \
    mkdir -p /etc/yara/rules /etc/yara/compiled /var/log/yara && \
    chown -R yara:yara /etc/yara /var/log/yara

# Copy YARA rules
COPY rules/ /etc/yara/rules/

# Compile rules
RUN yarac /etc/yara/rules /etc/yara/compiled/rules.yar

# Switch to yara user
USER yara
WORKDIR /home/yara

# Default command
ENTRYPOINT ["yara"]
CMD ["--help"]