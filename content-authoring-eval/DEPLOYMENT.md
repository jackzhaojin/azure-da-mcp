# Deployment Guide - Content Authoring Eval

This guide covers local Docker deployment and production deployment to Oracle VM.

## Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- Node.js 20.x LTS (for local development)
- Git
- Oracle Cloud VM (for production deployment)

## Environment Variables

Create a `.env.local` file in the project root:

```bash
# Claude API Authentication (OAuth token)
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...

# Claude Model (optional, defaults to Sonnet 4.5)
CLAUDE_MODEL=claude-sonnet-4-5-20250929

# Node Environment (production in Docker)
NODE_ENV=production
```

## Local Docker Deployment

### 1. Build Docker Image

```bash
docker build -t content-authoring-eval:latest .
```

Build time: ~5-10 minutes (first build)
Image size: ~1.5GB (includes Chromium and dependencies)

### 2. Run with Docker Compose

```bash
# Start container in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop container
docker-compose down
```

### 3. Access Application

- App: http://localhost:3000
- Health Check: http://localhost:3000/api/evaluate

### 4. Verify Container Health

```bash
# Check health status
docker inspect --format='{{.State.Health.Status}}' content-authoring-eval

# View health check logs
docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' content-authoring-eval
```

Expected output: `healthy` (after ~40 seconds)

## Production Deployment - Oracle VM

### GitHub Actions Workflow

The repository includes a GitHub Actions workflow (`.github/workflows/deploy-content-authoring-eval.yml`) that:

1. Builds multi-arch Docker image (amd64 + arm64)
2. Pushes to Docker Hub (docker.io)
3. SSH into Oracle VM
4. Pulls latest image
5. Restarts container with docker-compose
6. Verifies health status

**Trigger conditions**:
- Push to `main` branch when files in `content-authoring-eval/**` change
- Manual workflow dispatch

### Required GitHub Secrets

Configure these in **Settings → Secrets and variables → Actions**:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `DOCKERHUB_USERNAME` | Docker Hub username | `jackjin` |
| `DOCKERHUB_TOKEN` | Docker Hub access token | `dckr_pat_...` |
| `ORACLE_HOST` | Oracle VM public IP or hostname | `123.45.67.89` |
| `ORACLE_USER` | SSH username | `ubuntu` or `opc` |
| `ORACLE_SSH_KEY` | Private SSH key (entire content) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude OAuth token | `sk-ant-oat01-...` |

**Note**: Docker Hub access tokens can be created at https://hub.docker.com/settings/security

### Oracle VM Setup (One-Time)

SSH into your Oracle VM:

```bash
ssh -i ~/.ssh/oracle-vm.pem ubuntu@<ORACLE_HOST>

# 1. Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# 2. Install Docker Compose
sudo apt-get update
sudo apt-get install docker-compose-plugin

# 3. Create application directory
mkdir -p ~/content-authoring-eval
cd ~/content-authoring-eval

# 4. Create .env.local file
cat > .env.local <<EOF
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
CLAUDE_MODEL=claude-sonnet-4-5-20250929
NODE_ENV=production
EOF

# 5. Create docker-compose.yml (copy from repository)
# ... (same content as local docker-compose.yml)

# 6. Configure firewall
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save
```

### Manual Deployment to Oracle VM

If you prefer manual deployment over GitHub Actions:

```bash
# 1. SSH into Oracle VM
ssh -i ~/.ssh/oracle-vm.pem ubuntu@<ORACLE_HOST>

# 2. Navigate to app directory
cd ~/content-authoring-eval

# 3. Login to Docker Hub
echo "<DOCKERHUB_TOKEN>" | docker login docker.io -u <DOCKERHUB_USERNAME> --password-stdin

# 4. Pull latest image
docker pull docker.io/<DOCKERHUB_USERNAME>/content-authoring-eval:latest

# 5. Ensure docker-compose.yml uses Docker Hub image
# Verify: image: ${DOCKERHUB_USERNAME:-jackjin}/content-authoring-eval:latest

# 6. Restart container
docker-compose down
docker-compose up -d

# 7. Verify deployment
docker ps
docker-compose logs --tail=50
```

### Trigger Deployment

Deployment happens automatically on push to `main` branch:

```bash
git add .
git commit -m "Deploy Phase 14: Docker deployment"
git push origin main
```

Monitor deployment:
- **Actions tab** on GitHub repository
- Watch workflow progress in real-time
- View build logs and deployment status

### Rollback

If deployment fails, rollback to previous version:

```bash
# SSH into Oracle VM
ssh -i ~/.ssh/oracle-vm.pem ubuntu@<ORACLE_HOST>
cd ~/content-authoring-eval

# Pull specific image tag (e.g., main-abc1234)
docker pull docker.io/<DOCKERHUB_USERNAME>/content-authoring-eval:main-abc1234

# Update docker-compose.yml image tag
# Restart container
docker-compose down
docker-compose up -d
```

## Multi-Architecture Support

The Docker image supports both **amd64** (Intel/AMD) and **arm64** (ARM) architectures:

- Local development: Uses native architecture
- Oracle VM: Automatically selects correct architecture
- GitHub Actions: Builds both architectures simultaneously

## Resource Limits

Docker Compose configuration includes resource limits:

- **CPU Limit**: 2 cores
- **Memory Limit**: 2GB
- **CPU Reservation**: 1 core
- **Memory Reservation**: 512MB

Adjust in `docker-compose.yml` if needed:

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

## Troubleshooting

### Container fails to start

```bash
# View container logs
docker-compose logs

# Check health status
docker inspect content-authoring-eval

# Enter container for debugging
docker exec -it content-authoring-eval sh
```

### Playwright errors

Chromium may fail if system dependencies are missing. Verify dependencies in Dockerfile:

```dockerfile
# Runtime dependencies for Playwright Chromium
RUN apt-get update && apt-get install -y \
    libnss3 libnspr4 libdbus-1-3 ...
```

### Image size too large

Current image size: ~1.5GB (includes Chromium)

To reduce size:
- Remove unnecessary system dependencies
- Use alpine-based images (not recommended for Playwright)
- Exclude unused Playwright browsers

### Environment variables not loading

Verify `.env.local` exists in the same directory as `docker-compose.yml`:

```bash
# Check file exists
ls -la .env.local

# View current environment in container
docker exec content-authoring-eval env | grep CLAUDE
```

### Health check failing

Health check endpoint: `GET /api/evaluate`

```bash
# Test health check manually
curl http://localhost:3000/api/evaluate

# View health check logs
docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' content-authoring-eval
```

## Performance Optimization

### Build Cache

GitHub Actions uses Docker layer caching:

```yaml
cache-from: type=gha
cache-to: type=gha,mode=max
```

Subsequent builds: ~2-3 minutes (cached layers)

### Image Registry

Images are stored in Docker Hub (docker.io):

- Free for public repositories
- Automatic builds triggered on push to main
- Automatic cleanup: Old images pruned after 24 hours on Oracle VM
- Image naming: `<DOCKERHUB_USERNAME>/content-authoring-eval:latest`

## Monitoring

### Container Logs

```bash
# Real-time logs
docker-compose logs -f

# Last 100 lines
docker-compose logs --tail=100

# Specific service logs
docker logs content-authoring-eval
```

### Health Checks

Container health is checked every 30 seconds:

- Start period: 40 seconds
- Timeout: 3 seconds
- Retries: 3

Status: `starting` → `healthy` (or `unhealthy` if failures)

### Resource Usage

```bash
# CPU and memory usage
docker stats content-authoring-eval

# Detailed container info
docker inspect content-authoring-eval
```

## Security Considerations

1. **Non-root user**: Container runs as `nextjs` user (UID 1001)
2. **Environment secrets**: Never commit `.env.local` to git
3. **SSH keys**: Use GitHub Secrets for `ORACLE_SSH_KEY`
4. **Docker Hub authentication**: Use `DOCKERHUB_TOKEN` access token (not password)
5. **Firewall**: Only expose port 3000, use HTTPS in production

## Next Steps

After successful deployment:

1. Configure custom domain (optional)
2. Set up HTTPS with Let's Encrypt (recommended)
3. Configure monitoring and alerts
4. Set up automated backups
5. Enable container auto-restart on failure

---

**Last Updated**: 2025-12-27
**Phase**: 14 - Docker & Oracle Deployment
