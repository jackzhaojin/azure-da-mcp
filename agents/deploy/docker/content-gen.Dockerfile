# content-gen agent — template-only, the thinnest image (lite instance)
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

COPY a2a-common ./a2a-common
COPY contracts ./contracts
COPY content-gen ./content-gen

WORKDIR /app/content-gen
ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "src/index.ts"]
