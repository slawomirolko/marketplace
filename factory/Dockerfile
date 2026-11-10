FROM node:26.13.0-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ARG SAFE_CHAIN_VERSION=1.5.27
RUN curl -fsSL "https://github.com/AikidoSec/safe-chain/releases/download/${SAFE_CHAIN_VERSION}/install-safe-chain.sh" | sh -s -- --ci
ENV PATH="/root/.safe-chain/bin:$PATH"

RUN safe-chain npm install -g pnpm@12.18.0

RUN python3 -m venv /opt/venv-legacy \
 && PATH="/opt/venv-legacy/bin:$PATH" safe-chain pip install --no-cache-dir langgraph langchain-mcp-adapters
RUN python3 -m venv /opt/venv-new \
 && PATH="/opt/venv-new/bin:$PATH" safe-chain pip install --no-cache-dir langgraph "langchain[mcp]>=1.4"

RUN useradd --create-home --uid 10001 poc && mkdir -p /data && chown poc /data
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY app/package.json ./app/
RUN safe-chain pnpm install --frozen-lockfile --prod --filter skill-factory
COPY src ./src
COPY spec ./spec
COPY workflows ./workflows
COPY app/csp.ts app/data.ts ./app/
COPY app/dist ./app/dist
COPY test ./test
COPY py ./py
COPY run-tests.sh ./
RUN sed -i 's/\r$//' run-tests.sh && chmod +x run-tests.sh && chown -R poc /app

USER poc
ENV PATH="/opt/venv-legacy/bin:$PATH"
ENV FACTORY_DATA_DIR=/data
CMD ["./run-tests.sh"]
