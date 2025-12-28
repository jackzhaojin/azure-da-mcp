#!/bin/bash
# Content Authoring Eval - Local Multi-Arch Docker Build Script
# Phase 15.1: Build multi-arch images locally for development and testing
#
# USAGE:
#   ./docker-build-local.sh                    # Build with default tag
#   IMAGE_TAG=myregistry/myimage:v1 ./docker-build-local.sh  # Custom tag
#   PLATFORMS=linux/arm64 ./docker-build-local.sh           # Single platform
#
# FEATURES:
#   - Multi-arch build (amd64 + arm64) by default
#   - Does NOT delete containers or images (kept for testing)
#   - Customizable image tag via IMAGE_TAG environment variable
#   - Shows final image details (size, platforms)
#
# MANUAL PUSH TO REGISTRY:
#   docker push <IMAGE_TAG>
#   # Example: docker push ghcr.io/username/content-authoring-eval:latest
#
# RUN LOCALLY:
#   docker run -d --name content-authoring-eval-test \
#     -p 3000:3000 \
#     --env-file .env.local \
#     <IMAGE_TAG>

set -e  # Exit on error

# ============================================
# Configuration
# ============================================

# Default image tag (can be overridden with IMAGE_TAG env var)
DEFAULT_TAG="content-authoring-eval:local"
IMAGE_TAG="${IMAGE_TAG:-$DEFAULT_TAG}"

# Platforms to build (can be overridden with PLATFORMS env var)
# Default: Both amd64 (Intel/AMD) and arm64 (Apple Silicon, Oracle Cloud ARM)
DEFAULT_PLATFORMS="linux/amd64,linux/arm64"
PLATFORMS="${PLATFORMS:-$DEFAULT_PLATFORMS}"

# Build arguments (optional)
BUILD_ARGS="${BUILD_ARGS:-}"

# ============================================
# Colors for output
# ============================================
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ============================================
# Helper functions
# ============================================

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

# ============================================
# Pre-flight checks
# ============================================

info "Content Authoring Eval - Local Docker Build"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    error "Docker not found. Please install Docker Desktop."
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    error "Docker daemon not running. Please start Docker Desktop."
    exit 1
fi

# Check if buildx is available
if ! docker buildx version &> /dev/null; then
    error "Docker buildx not found. Update Docker Desktop to latest version."
    exit 1
fi

# Check if Dockerfile exists
if [ ! -f "Dockerfile" ]; then
    error "Dockerfile not found in current directory."
    error "Please run this script from: /path/to/azure-da-mcp/content-authoring-eval/"
    exit 1
fi

success "Pre-flight checks passed"
echo ""

# ============================================
# Build configuration display
# ============================================

info "Build Configuration:"
echo "  Image Tag:  ${IMAGE_TAG}"
echo "  Platforms:  ${PLATFORMS}"
echo "  Build Args: ${BUILD_ARGS:-None}"
echo "  Dockerfile: $(pwd)/Dockerfile"
echo ""

# ============================================
# Create buildx builder (if needed)
# ============================================

BUILDER_NAME="content-authoring-eval-builder"

# Check if builder already exists
if docker buildx inspect "$BUILDER_NAME" &> /dev/null; then
    info "Using existing buildx builder: $BUILDER_NAME"
else
    info "Creating new buildx builder: $BUILDER_NAME"
    docker buildx create --name "$BUILDER_NAME" --driver docker-container --bootstrap
    success "Builder created: $BUILDER_NAME"
fi

# Use the builder
docker buildx use "$BUILDER_NAME"

echo ""

# ============================================
# Build multi-arch image
# ============================================

info "Starting multi-arch build..."
echo ""

# Build command with parameters
# --load: Load image to local Docker (works for single platform only)
# --tag: Image tag
# --platform: Target platforms
# --progress: Show build progress (auto, plain, tty)
# --cache-from: Use cache from previous builds
# --cache-to: Save cache for future builds

# For multi-arch builds, we need to use --push or --output type=docker
# Since we want to keep images locally without pushing, we'll build each platform separately
# and then create a manifest

BUILD_START=$(date +%s)

# Parse platforms into array
IFS=',' read -ra PLATFORM_ARRAY <<< "$PLATFORMS"

# Build each platform separately
for PLATFORM in "${PLATFORM_ARRAY[@]}"; do
    info "Building for platform: $PLATFORM"

    # Replace slashes with dashes for tag suffix
    PLATFORM_SUFFIX=$(echo "$PLATFORM" | sed 's/\//-/g')
    PLATFORM_TAG="${IMAGE_TAG}-${PLATFORM_SUFFIX}"

    docker buildx build \
        --platform "$PLATFORM" \
        --tag "$PLATFORM_TAG" \
        --load \
        --progress=auto \
        --cache-from type=local,src=/tmp/.buildx-cache-"$PLATFORM_SUFFIX" \
        --cache-to type=local,dest=/tmp/.buildx-cache-"$PLATFORM_SUFFIX",mode=max \
        $BUILD_ARGS \
        .

    success "Built $PLATFORM image: $PLATFORM_TAG"
    echo ""
done

BUILD_END=$(date +%s)
BUILD_DURATION=$((BUILD_END - BUILD_START))

success "Multi-arch build completed in ${BUILD_DURATION}s"
echo ""

# ============================================
# Tag default platform image (for local use)
# ============================================

# For local builds, we tag the native platform as the default
# Multi-arch manifests require registry push, so we just tag the current architecture
if [ "${#PLATFORM_ARRAY[@]}" -gt 1 ]; then
    info "Multi-platform build complete - tagging native platform as default"

    # Detect current platform
    CURRENT_ARCH=$(uname -m)
    if [ "$CURRENT_ARCH" == "arm64" ] || [ "$CURRENT_ARCH" == "aarch64" ]; then
        DEFAULT_PLATFORM="linux/arm64"
    else
        DEFAULT_PLATFORM="linux/amd64"
    fi

    PLATFORM_SUFFIX=$(echo "$DEFAULT_PLATFORM" | sed 's/\//-/g')
    PLATFORM_TAG="${IMAGE_TAG}-${PLATFORM_SUFFIX}"

    # Check if platform was built
    if docker image inspect "$PLATFORM_TAG" &> /dev/null; then
        docker tag "$PLATFORM_TAG" "$IMAGE_TAG"
        success "Tagged $DEFAULT_PLATFORM as default: $IMAGE_TAG"
        info "Other platforms available: ${PLATFORM_TAG} (use platform-specific tag to run)"
    else
        warn "Native platform $DEFAULT_PLATFORM not found in build"
        # Tag first available platform
        FIRST_PLATFORM="${PLATFORM_ARRAY[0]}"
        FIRST_SUFFIX=$(echo "$FIRST_PLATFORM" | sed 's/\//-/g')
        docker tag "${IMAGE_TAG}-${FIRST_SUFFIX}" "$IMAGE_TAG"
        success "Tagged $FIRST_PLATFORM as default: $IMAGE_TAG"
    fi
    echo ""
else
    info "Single platform build - tagging image as: $IMAGE_TAG"
    PLATFORM_SUFFIX=$(echo "${PLATFORM_ARRAY[0]}" | sed 's/\//-/g')
    docker tag "${IMAGE_TAG}-${PLATFORM_SUFFIX}" "$IMAGE_TAG"
    success "Image tagged: $IMAGE_TAG"
    echo ""
fi

# ============================================
# Display build results
# ============================================

info "Build Summary:"
echo ""

# List built images
info "Built images (NOT deleted - kept for testing):"
for PLATFORM in "${PLATFORM_ARRAY[@]}"; do
    PLATFORM_SUFFIX=$(echo "$PLATFORM" | sed 's/\//-/g')
    PLATFORM_TAG="${IMAGE_TAG}-${PLATFORM_SUFFIX}"

    # Get image size
    IMAGE_SIZE=$(docker image inspect "$PLATFORM_TAG" --format='{{.Size}}' 2>/dev/null || echo "0")
    IMAGE_SIZE_MB=$((IMAGE_SIZE / 1024 / 1024))

    echo "  - $PLATFORM_TAG (${IMAGE_SIZE_MB} MB)"
done

# Display main tag
if [ "${#PLATFORM_ARRAY[@]}" -gt 1 ]; then
    echo "  - $IMAGE_TAG (multi-arch manifest)"
else
    IMAGE_SIZE=$(docker image inspect "$IMAGE_TAG" --format='{{.Size}}' 2>/dev/null || echo "0")
    IMAGE_SIZE_MB=$((IMAGE_SIZE / 1024 / 1024))
    echo "  - $IMAGE_TAG (${IMAGE_SIZE_MB} MB)"
fi

echo ""

# ============================================
# Next steps
# ============================================

success "Build complete! Next steps:"
echo ""
echo "1️⃣  Test locally:"
echo "    docker run -d --name content-authoring-eval-test \\"
echo "      -p 3000:3000 \\"
echo "      --env-file .env.local \\"
echo "      $IMAGE_TAG"
echo ""
echo "    # Test health endpoint"
echo "    curl http://localhost:3000/api/evaluate"
echo ""
echo "    # View logs"
echo "    docker logs -f content-authoring-eval-test"
echo ""
echo "    # Stop and remove container"
echo "    docker stop content-authoring-eval-test && docker rm content-authoring-eval-test"
echo ""

echo "2️⃣  Push to custom registry:"
echo "    # Login to registry"
echo "    docker login ghcr.io  # or docker.io, or your registry"
echo ""
echo "    # Tag for registry (if needed)"
echo "    docker tag $IMAGE_TAG ghcr.io/username/content-authoring-eval:v1.0.0"
echo ""
echo "    # Push to registry"
echo "    docker push ghcr.io/username/content-authoring-eval:v1.0.0"
echo ""

echo "3️⃣  Inspect image:"
echo "    docker image inspect $IMAGE_TAG"
echo ""

echo "4️⃣  Remove images (when done):"
echo "    docker rmi $IMAGE_TAG"
for PLATFORM in "${PLATFORM_ARRAY[@]}"; do
    PLATFORM_SUFFIX=$(echo "$PLATFORM" | sed 's/\//-/g')
    echo "    docker rmi ${IMAGE_TAG}-${PLATFORM_SUFFIX}"
done
echo ""

# ============================================
# Optional: Display image details
# ============================================

if command -v jq &> /dev/null; then
    info "Image details:"
    docker image inspect "$IMAGE_TAG" | jq -r '.[0] | {
        Id: .Id,
        Created: .Created,
        Size: (.Size / 1024 / 1024 | floor | tostring + " MB"),
        Architecture: .Architecture,
        Os: .Os,
        Layers: (.RootFS.Layers | length)
    }'
else
    warn "Install 'jq' to see formatted image details: brew install jq"
fi

echo ""
success "All done! Images are ready for testing."
