#!/bin/bash
#
# deploy-vps.sh - Deploy application to a VPS with zero-downtime
#
# Usage:
#   ./scripts/deploy-vps.sh user@server.com
#   ./scripts/deploy-vps.sh user@server.com --tag v1.0
#   ./scripts/deploy-vps.sh user@server.com --migrate
#
# Prerequisites:
#   - SSH key authentication configured
#   - Docker installed on the VPS
#   - Image already pushed to registry (run ./scripts/deploy.sh --push first)
#
# Environment variables:
#   DOCKER_REGISTRY  - Registry URL (default: docker.io)
#   DOCKER_IMAGE     - Image name (default: resume-builder)
#   REMOTE_DIR       - Remote working directory (default: /opt/resume-builder)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DOCKER_REGISTRY="${DOCKER_REGISTRY:-docker.io}"
DOCKER_IMAGE="${DOCKER_IMAGE:-resume-builder}"
REMOTE_DIR="${REMOTE_DIR:-/opt/resume-builder}"
CONTAINER_NAME="resume-builder"
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_INTERVAL=2

# Parse arguments
SSH_TARGET=""
VERSION_TAG="latest"
RUN_MIGRATIONS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --tag)
            VERSION_TAG="$2"
            shift 2
            ;;
        --migrate)
            RUN_MIGRATIONS=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 <user@server> [--tag <version>] [--migrate]"
            echo ""
            echo "Arguments:"
            echo "  user@server     SSH target (required)"
            echo ""
            echo "Options:"
            echo "  --tag <ver>     Image version tag (default: latest)"
            echo "  --migrate       Run database migrations"
            echo ""
            echo "Environment variables:"
            echo "  DOCKER_REGISTRY  Registry URL (default: docker.io)"
            echo "  DOCKER_IMAGE     Image name (default: resume-builder)"
            echo "  REMOTE_DIR       Remote directory (default: /opt/resume-builder)"
            exit 0
            ;;
        -*)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
        *)
            SSH_TARGET="$1"
            shift
            ;;
    esac
done

if [[ -z "$SSH_TARGET" ]]; then
    echo -e "${RED}Error: SSH target required${NC}"
    echo "Usage: $0 <user@server> [--tag <version>] [--migrate]"
    exit 1
fi

FULL_IMAGE="${DOCKER_REGISTRY}/${DOCKER_IMAGE}:${VERSION_TAG}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  VPS Deployment - Zero Downtime${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Target:  ${GREEN}${SSH_TARGET}${NC}"
echo -e "Image:   ${GREEN}${FULL_IMAGE}${NC}"
echo -e "Migrate: ${GREEN}${RUN_MIGRATIONS}${NC}"
echo ""

# Function to run commands on remote server
remote_exec() {
    ssh -o StrictHostKeyChecking=accept-new "$SSH_TARGET" "$@"
}

# Step 1: Test SSH connection
echo -e "${YELLOW}[1/6] Testing SSH connection...${NC}"
if ! remote_exec "echo 'SSH connection successful'"; then
    echo -e "${RED}Failed to connect to ${SSH_TARGET}${NC}"
    exit 1
fi
echo ""

# Step 2: Pull the latest image
echo -e "${YELLOW}[2/6] Pulling latest image...${NC}"
remote_exec "docker pull ${FULL_IMAGE}"
echo -e "${GREEN}Image pulled successfully${NC}"
echo ""

# Step 3: Run migrations (if requested)
if [[ "$RUN_MIGRATIONS" == "true" ]]; then
    echo -e "${YELLOW}[3/6] Running database migrations...${NC}"
    # Run migrations in a temporary container with access to the data volume
    remote_exec "docker run --rm \
        -v resume_data:/app/data \
        -e NODE_ENV=production \
        ${FULL_IMAGE} \
        node dist/backend/migrations/run.js" || {
        echo -e "${YELLOW}No migrations script found or migrations failed${NC}"
        echo -e "${YELLOW}Continuing with deployment...${NC}"
    }
    echo ""
else
    echo -e "${YELLOW}[3/6] Skipping migrations (use --migrate to enable)${NC}"
    echo ""
fi

# Step 4: Zero-downtime container swap
echo -e "${YELLOW}[4/6] Starting zero-downtime deployment...${NC}"

# Check if container exists
OLD_CONTAINER_EXISTS=$(remote_exec "docker ps -a --filter name=^${CONTAINER_NAME}\$ --format '{{.Names}}'" || echo "")

if [[ -n "$OLD_CONTAINER_EXISTS" ]]; then
    echo "Existing container found, performing rolling update..."

    # Rename old container
    OLD_CONTAINER_NAME="${CONTAINER_NAME}-old-$(date +%s)"
    remote_exec "docker rename ${CONTAINER_NAME} ${OLD_CONTAINER_NAME}"

    # Start new container
    echo "Starting new container..."
    remote_exec "docker run -d \
        --name ${CONTAINER_NAME} \
        --restart unless-stopped \
        -p 3001:3001 \
        -v resume_data:/app/data \
        -e NODE_ENV=production \
        -e PORT=3001 \
        -e DATA_DIR=/app/data \
        --env-file ${REMOTE_DIR}/.env \
        ${FULL_IMAGE}"

    # Wait for health check
    echo "Waiting for health check..."
    HEALTHY=false
    for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
        sleep $HEALTH_CHECK_INTERVAL
        STATUS=$(remote_exec "docker inspect --format='{{.State.Health.Status}}' ${CONTAINER_NAME} 2>/dev/null" || echo "starting")
        echo "  Health check attempt $i/$HEALTH_CHECK_RETRIES: $STATUS"

        if [[ "$STATUS" == "healthy" ]]; then
            HEALTHY=true
            break
        elif [[ "$STATUS" == "unhealthy" ]]; then
            echo -e "${RED}Container failed health check!${NC}"
            break
        fi
    done

    if [[ "$HEALTHY" == "true" ]]; then
        echo -e "${GREEN}New container is healthy!${NC}"

        # Stop and remove old container
        echo "Removing old container..."
        remote_exec "docker stop ${OLD_CONTAINER_NAME} && docker rm ${OLD_CONTAINER_NAME}"
        echo -e "${GREEN}Old container removed${NC}"
    else
        echo -e "${RED}Deployment failed - rolling back${NC}"

        # Remove failed new container
        remote_exec "docker stop ${CONTAINER_NAME} 2>/dev/null || true"
        remote_exec "docker rm ${CONTAINER_NAME} 2>/dev/null || true"

        # Restore old container name
        remote_exec "docker rename ${OLD_CONTAINER_NAME} ${CONTAINER_NAME}"

        echo -e "${YELLOW}Rollback complete - old container restored${NC}"
        exit 1
    fi
else
    echo "No existing container, starting fresh..."
    remote_exec "docker run -d \
        --name ${CONTAINER_NAME} \
        --restart unless-stopped \
        -p 3001:3001 \
        -v resume_data:/app/data \
        -e NODE_ENV=production \
        -e PORT=3001 \
        -e DATA_DIR=/app/data \
        --env-file ${REMOTE_DIR}/.env \
        ${FULL_IMAGE}"

    # Wait for initial health check
    echo "Waiting for container to be healthy..."
    for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
        sleep $HEALTH_CHECK_INTERVAL
        STATUS=$(remote_exec "docker inspect --format='{{.State.Health.Status}}' ${CONTAINER_NAME} 2>/dev/null" || echo "starting")
        echo "  Health check attempt $i/$HEALTH_CHECK_RETRIES: $STATUS"

        if [[ "$STATUS" == "healthy" ]]; then
            echo -e "${GREEN}Container is healthy!${NC}"
            break
        fi
    done
fi
echo ""

# Step 5: Clean up old images
echo -e "${YELLOW}[5/6] Cleaning up old images...${NC}"
remote_exec "docker image prune -f --filter 'until=24h'" || true
echo ""

# Step 6: Verify deployment
echo -e "${YELLOW}[6/6] Verifying deployment...${NC}"
RUNNING=$(remote_exec "docker ps --filter name=^${CONTAINER_NAME}\$ --format '{{.Status}}'" || echo "")
if [[ -n "$RUNNING" ]]; then
    echo -e "${GREEN}Container status: ${RUNNING}${NC}"
else
    echo -e "${RED}Container not running!${NC}"
    exit 1
fi

# Test health endpoint
echo "Testing health endpoint..."
HEALTH_RESPONSE=$(remote_exec "curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/health" || echo "000")
if [[ "$HEALTH_RESPONSE" == "200" ]]; then
    echo -e "${GREEN}Health endpoint responding (HTTP 200)${NC}"
else
    echo -e "${YELLOW}Warning: Health endpoint returned HTTP ${HEALTH_RESPONSE}${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Deployed: ${FULL_IMAGE}"
echo "Server:   ${SSH_TARGET}"
echo ""
echo "Useful commands:"
echo "  ssh ${SSH_TARGET} docker logs -f ${CONTAINER_NAME}"
echo "  ssh ${SSH_TARGET} docker stats ${CONTAINER_NAME}"
