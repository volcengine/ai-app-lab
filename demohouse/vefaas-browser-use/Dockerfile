# Use Microsoft's Python base image with stable Ubuntu
FROM mcr.microsoft.com/playwright/python:v1.52.0-noble

WORKDIR /app

COPY requirements.txt .

RUN pip install -r requirements.txt

# Install xvfb and dependencies for headed browser
RUN apt-get update && apt-get install -y \
    fonts-dejavu \
    xvfb \
    x11-utils \
    xauth \
    vim \
    net-tools \
    iputils-ping \
    telnet \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install internal chrome version
ARG PIP_INDEX_URL
ARG PIP_TRUSTED_HOST
ARG TARGETARCH

# 根据架构选择不同的Chromium安装包
RUN set -eux; \
    apt-get update; \
    if [ "$TARGETARCH" = "amd64" ]; then \
        CHROMIUM_URL="https://lf3-ttcdn-tos.pstatp.com/obj/rocketpackagebackup/tmp_apks/1747194348chromium-browser-use-stable_117.0.5938.60-1_amd64.deb"; \
    else \
        CHROMIUM_URL="https://lf3-ttcdn-tos.pstatp.com/obj/rocketpackagebackup/tmp_apks/1751460803chromium-browser-use-stable_117.0.5938.60-1_arm64.deb"; \
    fi; \
    curl -o /tmp/chromium.deb "$CHROMIUM_URL"; \
    apt-get install -y --no-install-recommends /tmp/chromium.deb; \
    apt-get clean -y; \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/*

COPY . .

CMD ["xvfb-run", "--auto-servernum", "--server-args='-screen 0 800x600x24'", "python", "index.py"]
