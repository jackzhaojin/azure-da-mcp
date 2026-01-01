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
# Stage 3: Production Dependencies (Separate)
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
# Stage 4: Production Runtime
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

# PHASE 25.3: Prepare .claude directory (config will be generated at runtime from env vars)
# This prevents baking OAuth credentials into the Docker image
RUN mkdir -p /home/appuser/.claude && \
    chown -R appuser:appuser /home/appuser/.claude && \
    chown -R appuser:appuser /app

# Copy standalone Next.js build output (minimal)
COPY --from=builder --chown=appuser:appuser /app/.next/standalone ./
COPY --from=builder --chown=appuser:appuser /app/.next/static ./.next/static

# PHASE 31: Pre-install Playwright browsers for BOTH @playwright/mcp AND app scripts
# Use chromium (not chrome) for ARM64 compatibility
# Chrome is not available on ARM64/aarch64 - chromium is the ARM64 equivalent
# Install for BOTH Playwright versions to avoid version mismatch issues
WORKDIR /app

# Strategy: Install app's Playwright browsers from deps stage, then install @playwright/mcp's version
# This ensures both chromium-1200 (app) and chromium-1205 (@playwright/mcp) are available

# First: Install app's Playwright version (1.57.0 = chromium-1200) using npx from deps
COPY --from=deps /app/node_modules ./temp_node_modules
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright
RUN cd temp_node_modules && npx playwright install chromium --with-deps

# Second: Install @playwright/mcp's version (chromium-1205)
RUN /usr/local/lib/node_modules/@playwright/mcp/node_modules/.bin/playwright install chromium --with-deps

# Third: Copy all installed browsers to appuser directory and cleanup temp files
RUN mkdir -p /home/appuser/.cache/ms-playwright && \
    cp -r /root/.cache/ms-playwright/* /home/appuser/.cache/ms-playwright/ && \
    chown -R appuser:appuser /home/appuser/.cache && \
    rm -rf /root/.cache/ms-playwright && \
    rm -rf ./temp_node_modules

# Copy production node_modules from separate stage (after browser installation)
COPY --from=prod-deps --chown=appuser:appuser /app/node_modules ./node_modules

# Create directories for screenshots and temporary files
RUN mkdir -p /app/public/screenshots /app/.tmp && chown -R appuser:appuser /app/public /app/.tmp

# Copy entrypoint script (generates .claude.json from env vars at runtime)
COPY --chown=appuser:appuser docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# PHASE 25.3: Run as non-root user (REQUIRED for --dangerously-skip-permissions to work)
USER appuser

# Expose port 3000
EXPOSE 3000

# Set environment variables
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV HOME=/home/appuser
ENV PLAYWRIGHT_BROWSERS_PATH=/home/appuser/.cache/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/evaluate', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use entrypoint script to generate .claude.json before starting server
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Start Next.js server
CMD ["node", "server.js"]
