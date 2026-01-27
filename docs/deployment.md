# Deployment Guide

This guide covers deploying the Resume Builder application to production environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Build](#local-build)
- [Docker Registry Setup](#docker-registry-setup)
- [VPS Deployment](#vps-deployment)
- [Environment Configuration](#environment-configuration)
- [Database Migrations](#database-migrations)
- [Monitoring & Logs](#monitoring--logs)
- [Rollback Procedures](#rollback-procedures)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Local Machine
- Node.js 20+
- Docker and Docker CLI
- SSH client with key-based authentication

### Target Server (VPS)
- Docker installed and running
- Port 3001 accessible (or configure reverse proxy)
- At least 512MB RAM recommended

## Local Build

The `scripts/deploy.sh` script handles the complete build pipeline:

```bash
# Build locally (tests, lint, Docker image)
./scripts/deploy.sh

# Build and push to Docker registry
./scripts/deploy.sh --push

# Build with specific version tag
./scripts/deploy.sh --push --tag v1.2.0
```

### What It Does

1. **Runs tests** (`npm test`) - Vitest test suite
2. **Runs linter** (`npm run lint`) - ESLint checks
3. **Builds application** (`npm run build`) - TypeScript compilation
4. **Builds Docker image** - Multi-stage build for minimal image size

### Configuration

Set these environment variables before running:

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCKER_REGISTRY` | `docker.io` | Container registry URL |
| `DOCKER_IMAGE` | `resume-builder` | Image name |

Example:
```bash
export DOCKER_REGISTRY=ghcr.io/myorg
export DOCKER_IMAGE=resume-builder
./scripts/deploy.sh --push
```

## Docker Registry Setup

### Docker Hub

```bash
docker login
export DOCKER_REGISTRY=docker.io
export DOCKER_IMAGE=yourusername/resume-builder
./scripts/deploy.sh --push
```

### GitHub Container Registry

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
export DOCKER_REGISTRY=ghcr.io/yourusername
export DOCKER_IMAGE=resume-builder
./scripts/deploy.sh --push
```

### Private Registry

```bash
docker login registry.example.com
export DOCKER_REGISTRY=registry.example.com
export DOCKER_IMAGE=resume-builder
./scripts/deploy.sh --push
```

## VPS Deployment

### Initial Server Setup

1. **Install Docker** on your VPS:
   ```bash
   ssh user@your-server.com
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   ```

2. **Create application directory**:
   ```bash
   sudo mkdir -p /opt/resume-builder
   sudo chown $USER:$USER /opt/resume-builder
   ```

3. **Create environment file**:
   ```bash
   cat > /opt/resume-builder/.env << 'EOF'
   NODE_ENV=production
   PORT=3001
   DATA_DIR=/app/data

   # Authentication (set AUTH_DISABLED=false for production)
   AUTH_DISABLED=true
   AUTH0_DOMAIN=
   AUTH0_AUDIENCE=

   # LLM Provider
   ANTHROPIC_API_KEY=your-key-here
   OPENAI_API_KEY=
   LLM_PROVIDER=anthropic

   # RapidAPI (optional)
   RAPIDAPI_KEY=
   EOF
   ```

4. **Create data volume**:
   ```bash
   docker volume create resume_data
   ```

### Deploying

From your local machine:

```bash
# Deploy latest image
./scripts/deploy-vps.sh user@your-server.com

# Deploy specific version
./scripts/deploy-vps.sh user@your-server.com --tag v1.2.0

# Deploy with database migrations
./scripts/deploy-vps.sh user@your-server.com --migrate
```

### Zero-Downtime Strategy

The deployment script implements a rolling update:

1. Pulls the new image
2. Renames the running container
3. Starts a new container with the new image
4. Waits for health check to pass (up to 60 seconds)
5. If healthy: removes old container
6. If unhealthy: rolls back to old container

This ensures zero downtime for users during deployments.

## Environment Configuration

### Required Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `AUTH_DISABLED` | Set to `false` for production with Auth0 |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH0_DOMAIN` | - | Auth0 tenant domain |
| `AUTH0_AUDIENCE` | - | Auth0 API audience |
| `OPENAI_API_KEY` | - | OpenAI API key (alternative LLM) |
| `LLM_PROVIDER` | `anthropic` | `anthropic` or `openai` |
| `RAPIDAPI_KEY` | - | RapidAPI key for job search |

### Updating Environment Variables

1. SSH to server and edit `/opt/resume-builder/.env`
2. Redeploy to apply changes:
   ```bash
   ./scripts/deploy-vps.sh user@your-server.com
   ```

## Database Migrations

The application uses SQLite by default with the database stored in a Docker volume.

### Running Migrations

```bash
./scripts/deploy-vps.sh user@your-server.com --migrate
```

This runs migrations in a temporary container before starting the new version.

### Manual Migration

```bash
ssh user@your-server.com
docker run --rm \
  -v resume_data:/app/data \
  -e NODE_ENV=production \
  your-image:latest \
  node dist/backend/migrations/run.js
```

### Backup Database

```bash
ssh user@your-server.com
docker run --rm \
  -v resume_data:/app/data \
  -v $(pwd):/backup \
  alpine \
  cp /app/data/resume.db /backup/resume-$(date +%Y%m%d).db
```

## Monitoring & Logs

### View Logs

```bash
# Follow logs in real-time
ssh user@your-server.com docker logs -f resume-builder

# Last 100 lines
ssh user@your-server.com docker logs --tail 100 resume-builder
```

### Container Stats

```bash
ssh user@your-server.com docker stats resume-builder
```

### Health Check

The container includes a health check at `/api/health`:

```bash
curl http://your-server.com:3001/api/health
```

## Rollback Procedures

### Automatic Rollback

If a deployment fails health checks, the script automatically rolls back to the previous version.

### Manual Rollback

1. **Find previous image**:
   ```bash
   ssh user@your-server.com docker images | grep resume-builder
   ```

2. **Deploy previous version**:
   ```bash
   ./scripts/deploy-vps.sh user@your-server.com --tag previous-sha
   ```

3. **Or manually restart old image**:
   ```bash
   ssh user@your-server.com
   docker stop resume-builder
   docker rm resume-builder
   docker run -d \
     --name resume-builder \
     --restart unless-stopped \
     -p 3001:3001 \
     -v resume_data:/app/data \
     --env-file /opt/resume-builder/.env \
     your-image:previous-tag
   ```

## Troubleshooting

### Container Won't Start

1. Check logs:
   ```bash
   ssh user@your-server.com docker logs resume-builder
   ```

2. Verify environment file exists:
   ```bash
   ssh user@your-server.com cat /opt/resume-builder/.env
   ```

3. Check port availability:
   ```bash
   ssh user@your-server.com netstat -tlnp | grep 3001
   ```

### Health Check Failing

1. Verify the application starts:
   ```bash
   ssh user@your-server.com docker logs resume-builder
   ```

2. Check if the health endpoint responds:
   ```bash
   ssh user@your-server.com curl -v http://localhost:3001/api/health
   ```

3. Ensure required environment variables are set (especially API keys)

### SSH Connection Issues

1. Verify SSH key is added:
   ```bash
   ssh-add -l
   ```

2. Test connection manually:
   ```bash
   ssh user@your-server.com echo "OK"
   ```

3. Check SSH config (`~/.ssh/config`) for correct settings

### Image Pull Fails

1. Verify Docker login:
   ```bash
   ssh user@your-server.com docker login your-registry.com
   ```

2. Check image exists in registry:
   ```bash
   docker manifest inspect your-registry.com/resume-builder:latest
   ```

### Database Issues

1. Check database file permissions:
   ```bash
   ssh user@your-server.com docker run --rm -v resume_data:/data alpine ls -la /data
   ```

2. Verify volume exists:
   ```bash
   ssh user@your-server.com docker volume ls | grep resume
   ```

## Reverse Proxy (Optional)

For production, put the application behind a reverse proxy like nginx or Caddy.

### Caddy Example

```
resume.example.com {
    reverse_proxy localhost:3001
}
```

### Nginx Example

```nginx
server {
    listen 80;
    server_name resume.example.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build and Push
        env:
          DOCKER_REGISTRY: ghcr.io/${{ github.repository_owner }}
          DOCKER_IMAGE: resume-builder
        run: |
          echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
          ./scripts/deploy.sh --push --tag ${{ github.sha }}

      - name: Deploy to VPS
        env:
          SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
          DOCKER_REGISTRY: ghcr.io/${{ github.repository_owner }}
          DOCKER_IMAGE: resume-builder
        run: |
          mkdir -p ~/.ssh
          echo "$SSH_PRIVATE_KEY" > ~/.ssh/id_rsa
          chmod 600 ~/.ssh/id_rsa
          ./scripts/deploy-vps.sh ${{ secrets.DEPLOY_USER }}@${{ secrets.DEPLOY_HOST }} --tag ${{ github.sha }}
```
