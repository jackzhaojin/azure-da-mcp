# coordinator — A2A server + Next.js dashboard on one port (basic instance)
FROM node:20-bookworm-slim
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
RUN npm ci -w @agents/coordinator --include-workspace-root=false --ignore-scripts

COPY a2a-common ./a2a-common
COPY contracts ./contracts
COPY coordinator ./coordinator

# bake the production Next build (src/index.ts mounts .next when NODE_ENV=production)
RUN cd coordinator && npx next build

WORKDIR /app/coordinator
ENV PORT=8080 NODE_ENV=production
EXPOSE 8080
CMD ["npx", "tsx", "src/index.ts"]
