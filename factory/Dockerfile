FROM node:24-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv curl \
 && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv-legacy && /opt/venv-legacy/bin/pip install --no-cache-dir langgraph langchain-mcp-adapters
RUN python3 -m venv /opt/venv-new && /opt/venv-new/bin/pip install --no-cache-dir langgraph "langchain[mcp]>=1.4"
ENV PATH="/opt/venv-legacy/bin:$PATH"

RUN useradd --create-home --uid 10001 poc && mkdir -p /data && chown poc /data
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
COPY test ./test
COPY py ./py
COPY run-tests.sh ./
RUN sed -i 's/\r$//' run-tests.sh && chmod +x run-tests.sh && chown -R poc /app

USER poc
ENV FACTORY_DATA_DIR=/data
CMD ["./run-tests.sh"]
