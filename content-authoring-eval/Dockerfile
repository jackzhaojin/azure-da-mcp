# Content Authoring Eval - Production Dockerfile (Optimized)
# Multi-stage build for Next.js 14 with Playwright Chromium support
# Optimized for GitHub Actions disk space constraints

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-slim AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with frozen lockfile
# Clean npm cache immediately to save space
RUN npm ci && npm cache clean --force

# ============================================
# Stage 2: Builder
# ============================================
FROM node:20-slim AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Build Next.js application (standalone mode)
# This generates optimized production build in .next/standalone
RUN npm run build && \
    # Clean up unnecessary files immediately after build
    rm -rf node_modules && \
    rm -rf .next/cache && \
    rm -rf src

# ============================================
# Stage 3: Playwright Dependencies (Minimal)
# ============================================
FROM node:20-slim AS playwright-deps
WORKDIR /app

# Install ONLY Playwright and its dependencies (not full node_modules)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    # Minimal dependencies for playwright install
    curl \
    ca-certificates && \
    # Install playwright-core only
    npm install --no-save playwright-core@1.57.0 && \
    # Install Chromium browser with system dependencies
    npx playwright install chromium --with-deps && \
    # Clean up aggressively
    npm cache clean --force && \
    apt-get remove -y curl && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    rm -rf /tmp/*

# ============================================
# Stage 4: Production Dependencies (Separate)
# ============================================
FROM node:20-slim AS prod-deps
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies
RUN npm ci --only=production && \
    npm cache clean --force && \
    # Remove unnecessary binaries and files
    find node_modules -type f -name '*.ts' -delete && \
    find node_modules -type f -name '*.md' -delete && \
    find node_modules -type d -name 'test' -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -type d -name 'tests' -exec rm -rf {} + 2>/dev/null || true

# ============================================
# Stage 5: Production Runtime
# ============================================
FROM node:20-slim AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# PHASE 25.3: Create non-root user (REQUIRED for Claude CLI --dangerously-skip-permissions)
RUN useradd -m -s /bin/bash appuser

# Install runtime dependencies for Playwright Chromium, Lighthouse CLI, and imagemagick
# Use --no-install-recommends to minimize size
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    # Chromium dependencies
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    # Additional utilities
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libu2f-udev \
    xdg-utils \
    # imagemagick for image diff (Phase 18 Visual Agent)
    imagemagick && \
    # Install Lighthouse CLI globally (for Structure and Accessibility agents)
    npm install -g lighthouse@12.2.1 && \
    # Install pa11y CLI globally (optional, for Accessibility agent)
    npm install -g pa11y@8.0.0 && \
    # PHASE 25: Install Claude Code CLI globally (REQUIRED for Agent SDK in container)
    npm install -g @anthropic-ai/claude-code && \
    # PHASE 25: Install MCP servers as npm packages (bundled for container)
    npm install -g @modelcontextprotocol/server-filesystem && \
    npm install -g @playwright/mcp && \
    # Clean up npm cache
    npm cache clean --force && \
    # Aggressive cleanup
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    rm -rf /tmp/* && \
    rm -rf /var/tmp/*

# PHASE 25.3: Create .claude.json with OAuth account info for CLI authentication
# This tells the `claude` CLI WHO is authenticated (account, email, org)
# The OAuth token itself comes from CLAUDE_CODE_OAUTH_TOKEN env var
RUN mkdir -p /home/appuser/.claude && \
    echo '{"oauthAccount":{"accountUuid":"434c49a7-3afc-4399-9a7c-c4fea4785c7b","emailAddress":"jackzhaojin@gmail.com","organizationUuid":"170f4c50-03d8-42fc-82b3-dd0a83e476ae"},"mcpServers":{}}' > /home/appuser/.claude.json && \
    chown -R appuser:appuser /home/appuser/.claude && \
    chown -R appuser:appuser /app

# Copy standalone Next.js build output (minimal)
COPY --from=builder --chown=appuser:appuser /app/.next/standalone ./
COPY --from=builder --chown=appuser:appuser /app/.next/static ./.next/static

# Copy Playwright browsers from playwright-deps stage
COPY --from=playwright-deps --chown=appuser:appuser /root/.cache/ms-playwright /home/appuser/.cache/ms-playwright

# Copy production node_modules from separate stage
COPY --from=prod-deps --chown=appuser:appuser /app/node_modules ./node_modules

# Set permissions for Playwright cache
RUN chown -R appuser:appuser /home/appuser/.cache

# Create directory for screenshots
RUN mkdir -p /app/public/screenshots && chown -R appuser:appuser /app/public

# PHASE 25.3: Run as non-root user (REQUIRED for --dangerously-skip-permissions to work)
USER appuser

# Expose port 3000
EXPOSE 3000

# Set environment variables
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV HOME=/home/appuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/evaluate', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start Next.js server
CMD ["node", "server.js"]
