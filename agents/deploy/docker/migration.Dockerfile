# migration agent — opencode (Kimi K2.6) + Playwright MCP validation
# (standard-1 instance: 4 GiB)
FROM node:20-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates unzip git \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY a2a-common/package.json a2a-common/
COPY eval-service/package.json eval-service/
COPY content-gen/package.json content-gen/
COPY migration-agent/package.json migration-agent/
COPY coordinator/package.json coordinator/
COPY store-mcp/package.json store-mcp/
COPY e2e/package.json e2e/
RUN npm ci -w @agents/migration-agent --include-workspace-root=false --ignore-scripts

# opencode binary (drives Kimi K2.6 headlessly via `opencode serve` + REST)
RUN curl -fsSL https://opencode.ai/install | bash
ENV OPENCODE_BIN=/root/.opencode/bin/opencode

# global opencode config: the kimi-code provider (key injected at runtime via
# MOONSHOT_API_KEY env — the config references {env:MOONSHOT_API_KEY})
COPY deploy/docker/opencode-global.jsonc /root/.config/opencode/opencode.jsonc

# Playwright MCP pre-installed (PLAYWRIGHT_MCP_BIN avoids npx-fetch at runtime)
# + Chromium matching ITS bundled playwright version; --with-deps pulls OS libs
RUN npm i -g @playwright/mcp@latest \
  && cd /usr/local/lib/node_modules/@playwright/mcp \
  && (npx playwright install --with-deps chromium || npx playwright-core install --with-deps chromium) \
  && rm -rf /var/lib/apt/lists/*

# the da-live-author-playwright skill (synced from /.claude/skills by `npm run sync-skill`)
COPY deploy/skills /app/skills

COPY a2a-common ./a2a-common
COPY contracts ./contracts
COPY migration-agent ./migration-agent

WORKDIR /app/migration-agent
ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "src/index.ts"]
