# eval agent — real engine: Chromium (deterministic .cjs + agentic Playwright
# MCP) + Claude Agent SDK. Container hardening mirrors the PROVEN v1 recipe
# (content-authoring-eval/Dockerfile): non-root user (the Claude CLI refuses
# agentic permission-skipping as root), TWO playwright browser caches merged
# (the app's and @playwright/mcp's revisions GC each other in a shared cache),
# and a runtime-generated .claude.json (no creds baked into the image).
FROM node:20-bookworm-slim
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY a2a-common/package.json a2a-common/
COPY eval-service/package.json eval-service/
COPY content-gen/package.json content-gen/
COPY migration-agent/package.json migration-agent/
COPY coordinator/package.json coordinator/
COPY store-mcp/package.json store-mcp/
COPY e2e/package.json e2e/
RUN npm ci -w @agents/eval-service --include-workspace-root=false --ignore-scripts

RUN useradd -m -s /bin/bash appuser

# 1) the app's playwright revision (deterministic .cjs shell-outs)
RUN PLAYWRIGHT_BROWSERS_PATH=/opt/pw-app ./node_modules/.bin/playwright install --with-deps chromium chromium-headless-shell

# 2) global tooling for the agentic tier: Claude Code CLI + the MCP servers the
# engine's Docker path expects (old bin name mcp-server-playwright → symlink)
RUN npm i -g @anthropic-ai/claude-code @playwright/mcp@latest @modelcontextprotocol/server-filesystem \
  && ln -sf /usr/local/bin/playwright-mcp /usr/local/bin/mcp-server-playwright

# 3) @playwright/mcp's OWN playwright revision into a separate cache
RUN PLAYWRIGHT_BROWSERS_PATH=/opt/pw-mcp \
  "$(find /usr/local/lib/node_modules/@playwright/mcp -name playwright -path '*/.bin/*' | head -1)" install --with-deps chromium chromium-headless-shell \
  || PLAYWRIGHT_BROWSERS_PATH=/opt/pw-mcp ./node_modules/.bin/playwright install chromium chromium-headless-shell

# 4) merge both revision sets into appuser's cache (cp -rn: neither clobbers)
ENV PLAYWRIGHT_BROWSERS_PATH=/home/appuser/.cache/ms-playwright
RUN mkdir -p /home/appuser/.cache/ms-playwright \
  && cp -rn /opt/pw-app/. /home/appuser/.cache/ms-playwright/ \
  && cp -rn /opt/pw-mcp/. /home/appuser/.cache/ms-playwright/ 2>/dev/null || true \
  && rm -rf /opt/pw-app /opt/pw-mcp /var/lib/apt/lists/*

COPY a2a-common ./a2a-common
COPY contracts ./contracts
COPY eval-service ./eval-service
COPY deploy/docker/eval-entrypoint.sh /usr/local/bin/eval-entrypoint.sh
RUN chmod +x /usr/local/bin/eval-entrypoint.sh \
  && chown -R appuser:appuser /app /home/appuser/.cache

USER appuser
ENV HOME=/home/appuser PORT=8080 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /app/eval-service
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/eval-entrypoint.sh"]
CMD ["npx", "tsx", "src/index.ts"]
