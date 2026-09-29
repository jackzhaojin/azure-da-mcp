# migration agent — opencode (Kimi) + Playwright MCP validation
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

# opencode binary (drives Kimi headlessly via `opencode serve` + REST).
# PINNED (v2.8.1): unpinned installs meant every image build silently took the
# newest opencode, and opencode also auto-installs patch releases at startup
# (autoupdate is now false in opencode-global.jsonc). The migration backend
# must run the binary it was tested with; bump deliberately, then re-run the
# opencode live test. 1.18.25 = the version behind the Aug 29 - Sep 1 successes.
ARG OPENCODE_VERSION=1.18.25
RUN curl -fsSL https://opencode.ai/install | bash -s -- --version ${OPENCODE_VERSION} \
  && /root/.opencode/bin/opencode --version
ENV OPENCODE_BIN=/root/.opencode/bin/opencode

# global opencode config: the kimi-code provider (key injected at runtime via
# MOONSHOT_API_KEY env — the config references {env:MOONSHOT_API_KEY})
COPY deploy/docker/opencode-global.jsonc /root/.config/opencode/opencode.jsonc

# Playwright MCP pre-installed (PLAYWRIGHT_MCP_BIN avoids npx-fetch at runtime)
# + Chromium matching ITS bundled playwright version; --with-deps pulls OS libs.
# PINNED (issue #14): @latest meant every image build silently took a new release
# (the 2026-09-19 rebuild moved to 0.0.82 and changed the error text mid-incident).
# Bump deliberately, then re-run `npm run probe:playwright -w @agents/migration-agent`
# inside the built image (see deploy/CLAUDE.md).
ARG PLAYWRIGHT_MCP_VERSION=0.0.82
RUN npm i -g @playwright/mcp@${PLAYWRIGHT_MCP_VERSION} \
  && cd /usr/local/lib/node_modules/@playwright/mcp \
  && (npx playwright install --with-deps chromium || npx playwright-core install --with-deps chromium) \
  && rm -rf /var/lib/apt/lists/*

# Launch the Chromium installed above, not the Google Chrome channel (issue #14).
# Unset, @playwright/mcp looks for /opt/google/chrome/chrome, which this image never
# had, so every cloud browser call failed and the migrator fell back to webfetch.
# The container runs as root, where Chromium's sandbox cannot start. Both names are
# @playwright/mcp's own env config; opencode-config.ts playwrightMcpCommand() also
# passes them as explicit --browser / --no-sandbox flags.
ENV PLAYWRIGHT_MCP_BROWSER=chromium \
    PLAYWRIGHT_MCP_SANDBOX=false

# the da-live-author-playwright skill (synced from /.claude/skills by `npm run sync-skill`)
COPY deploy/skills /app/skills

COPY a2a-common ./a2a-common
COPY contracts ./contracts
COPY migration-agent ./migration-agent

WORKDIR /app/migration-agent
ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "src/index.ts"]
