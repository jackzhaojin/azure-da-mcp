# content-gen agent — agentic brief/ideate (Claude Agent SDK) with a deterministic
# template fallback. No browser/MCP: writing is a tool-free generation pass, so
# this stays far lighter than eval. But the Agent SDK shells out to the Claude
# Code CLI, which REFUSES permission-skipping as root — so, like eval, this runs
# as a non-root appuser with a runtime-generated .claude.json (no creds baked in).
# Without Claude creds the agent simply falls back to the template tier.
FROM node:20-bookworm-slim
WORKDIR /app

# all workspace package.json stubs (npm ci validates the whole workspace tree)
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY a2a-common/package.json a2a-common/
COPY eval-service/package.json eval-service/
COPY content-gen/package.json content-gen/
COPY migration-agent/package.json migration-agent/
COPY coordinator/package.json coordinator/
COPY store-mcp/package.json store-mcp/
COPY e2e/package.json e2e/
RUN npm ci -w @agents/content-gen --include-workspace-root=false --ignore-scripts

# Claude Code CLI — the Agent SDK's query() spawns it for the agentic tier.
RUN npm i -g @anthropic-ai/claude-code

RUN useradd -m -s /bin/bash appuser

COPY a2a-common ./a2a-common
COPY contracts ./contracts
COPY content-gen ./content-gen
COPY deploy/docker/content-gen-entrypoint.sh /usr/local/bin/content-gen-entrypoint.sh
RUN chmod +x /usr/local/bin/content-gen-entrypoint.sh \
  && chown -R appuser:appuser /app

USER appuser
ENV HOME=/home/appuser PORT=8080
WORKDIR /app/content-gen
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/content-gen-entrypoint.sh"]
CMD ["npx", "tsx", "src/index.ts"]
