#!/bin/bash

# DeCrown Worker Transportation - Docker Deploy Script
# This script builds and pushes the Docker image directly to Render

set -e

echo ""
echo "=========================================="
echo "🐳 DeCrown Docker Deployment"
echo "=========================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    echo "   Please start Docker Desktop and try again"
    exit 1
fi

# Get Render username
echo "📝 Enter your Render username (or email):"
read RENDER_USERNAME

if [ -z "$RENDER_USERNAME" ]; then
    echo "❌ Error: Render username is required"
    exit 1
fi

IMAGE_NAME="decrown-worker-transportation"
RENDER_REGISTRY="registry.render.com"
FULL_IMAGE_NAME="${RENDER_REGISTRY}/${RENDER_USERNAME}/${IMAGE_NAME}"

echo ""
echo "🔨 Building Docker image..."
docker build -f Dockerfile.direct -t ${IMAGE_NAME}:latest .

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo ""
echo "✅ Build successful!"
echo ""
echo "🧪 Testing image locally..."
echo "   Starting container on port 3000..."

# Test the image
CONTAINER_ID=$(docker run -d -p 3000:3000 ${IMAGE_NAME}:latest)

echo "   Waiting for container to start..."
sleep 5

# Check health endpoint
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Health check passed!"
else
    echo "⚠️  Warning: Health check failed, but continuing..."
fi

# Stop test container
docker stop $CONTAINER_ID > /dev/null 2>&1
docker rm $CONTAINER_ID > /dev/null 2>&1

echo ""
echo "🏷️  Tagging image for Render..."
docker tag ${IMAGE_NAME}:latest ${FULL_IMAGE_NAME}:latest

echo ""
echo "🔐 Logging into Render registry..."
echo "   Registry: ${RENDER_REGISTRY}"
echo "   Username: ${RENDER_USERNAME}"
echo ""
echo "   You'll need your Render API key (get it from: https://dashboard.render.com/u/settings#api-keys)"
echo ""

docker login ${RENDER_REGISTRY}

if [ $? -ne 0 ]; then
    echo "❌ Login failed"
    exit 1
fi

echo ""
echo "📤 Pushing image to Render..."
docker push ${FULL_IMAGE_NAME}:latest

if [ $? -ne 0 ]; then
    echo "❌ Push failed"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ DEPLOYMENT SUCCESSFUL!"
echo "=========================================="
echo ""
echo "📦 Image pushed to:"
echo "   ${FULL_IMAGE_NAME}:latest"
echo ""
echo "🚀 Next Steps:"
echo ""
echo "1. Go to: https://dashboard.render.com"
echo "2. Click: New + → Web Service"
echo "3. Select: Deploy an existing image from a registry"
echo "4. Enter image URL:"
echo "   ${FULL_IMAGE_NAME}:latest"
echo ""
echo "5. Configure:"
echo "   - Name: decrown-worker-transportation"
echo "   - Region: Oregon (US West)"
echo "   - Port: 3000"
echo "   - Health Check Path: /health"
echo ""
echo "6. Click: Create Web Service"
echo ""
echo "🌐 Your app will be live at:"
echo "   https://decrown-worker-transportation.onrender.com"
echo ""
echo "=========================================="
echo ""
