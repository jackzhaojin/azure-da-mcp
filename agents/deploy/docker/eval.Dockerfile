# eval agent — real engine: Chromium (deterministic .cjs + agentic Playwright MCP)
# + Claude Agent SDK (standard-1 instance: 4 GiB)
FROM node:20-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY a2a-common/package.json a2a-common/
COPY eval-service/package.json eval-service/
COPY content-gen/package.json content-gen/
COPY migration-agent/package.json migration-agent/
COPY coordinator/package.json coordinator/
COPY ui/package.json ui/
COPY store-mcp/package.json store-mcp/
COPY e2e/package.json e2e/
RUN npm ci -w @agents/eval-service --include-workspace-root=false --ignore-scripts

# Chromium + OS deps for the workspace's playwright version
RUN npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*

# global MCP servers the agentic tier expects at /usr/local/bin in Docker
# (mcp-config.ts isDocker() path expects the OLD bin name mcp-server-playwright;
# @playwright/mcp now installs as playwright-mcp — symlink both)
RUN npm i -g @playwright/mcp@latest @modelcontextprotocol/server-filesystem \
  && ln -sf /usr/local/bin/playwright-mcp /usr/local/bin/mcp-server-playwright

COPY a2a-common ./a2a-common
COPY contracts ./contracts
COPY eval-service ./eval-service

WORKDIR /app/eval-service
ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "src/index.ts"]
