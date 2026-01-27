#!/bin/bash
#
# deploy.sh - Build and package the application for deployment
#
# Usage:
#   ./scripts/deploy.sh                    # Build only (local development)
#   ./scripts/deploy.sh --push             # Build and push to registry
#   ./scripts/deploy.sh --push --tag v1.0  # Build with custom tag and push
#
# Environment variables:
#   DOCKER_REGISTRY  - Registry URL (default: docker.io)
#   DOCKER_IMAGE     - Image name (default: resume-builder)
#

set -e  # Exit on first error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOCKER_REGISTRY="${DOCKER_REGISTRY:-docker.io}"
DOCKER_IMAGE="${DOCKER_IMAGE:-resume-builder}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Parse arguments
PUSH_TO_REGISTRY=false
CUSTOM_TAG=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --push)
            PUSH_TO_REGISTRY=true
            shift
            ;;
        --tag)
            CUSTOM_TAG="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [--push] [--tag <version>]"
            echo ""
            echo "Options:"
            echo "  --push        Push image to registry after build"
            echo "  --tag <ver>   Use custom version tag (default: git SHA)"
            echo ""
            echo "Environment variables:"
            echo "  DOCKER_REGISTRY  Registry URL (default: docker.io)"
            echo "  DOCKER_IMAGE     Image name (default: resume-builder)"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Generate version tag
if [[ -n "$CUSTOM_TAG" ]]; then
    VERSION_TAG="$CUSTOM_TAG"
else
    VERSION_TAG="$(git rev-parse --short HEAD)"
fi

FULL_IMAGE_NAME="${DOCKER_REGISTRY}/${DOCKER_IMAGE}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Resume Builder Deployment Pipeline${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Image: ${GREEN}${FULL_IMAGE_NAME}:${VERSION_TAG}${NC}"
echo ""

cd "$PROJECT_ROOT"

# Step 1: Run tests
echo -e "${YELLOW}[1/4] Running tests...${NC}"
npm test
echo -e "${GREEN}Tests passed!${NC}"
echo ""

# Step 2: Run linter
echo -e "${YELLOW}[2/4] Running linter...${NC}"
npm run lint
echo -e "${GREEN}Lint passed!${NC}"
echo ""

# Step 3: Build application
echo -e "${YELLOW}[3/4] Building application...${NC}"
npm run build
echo -e "${GREEN}Build complete!${NC}"
echo ""

# Step 4: Build Docker image
echo -e "${YELLOW}[4/4] Building Docker image...${NC}"
docker build \
    -t "${FULL_IMAGE_NAME}:${VERSION_TAG}" \
    -t "${FULL_IMAGE_NAME}:latest" \
    --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --build-arg GIT_SHA="$(git rev-parse HEAD)" \
    .
echo -e "${GREEN}Docker image built: ${FULL_IMAGE_NAME}:${VERSION_TAG}${NC}"
echo ""

# Optional: Push to registry
if [[ "$PUSH_TO_REGISTRY" == "true" ]]; then
    echo -e "${YELLOW}Pushing to registry...${NC}"
    docker push "${FULL_IMAGE_NAME}:${VERSION_TAG}"
    docker push "${FULL_IMAGE_NAME}:latest"
    echo -e "${GREEN}Image pushed to registry!${NC}"
else
    echo -e "${BLUE}Skipping registry push (use --push to enable)${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment build complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Image tags:"
echo "  - ${FULL_IMAGE_NAME}:${VERSION_TAG}"
echo "  - ${FULL_IMAGE_NAME}:latest"
echo ""

if [[ "$PUSH_TO_REGISTRY" == "false" ]]; then
    echo "To push to registry, run:"
    echo "  $0 --push"
fi
