# DeCrown - Deploy to Docker Hub then Render
# This pushes to Docker Hub (public registry) which Render can pull from

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🐳 Deploy to Docker Hub for Render" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$DOCKER_USERNAME = "dice26"
$IMAGE_NAME = "decrown-worker-transportation"
$FULL_IMAGE = "${DOCKER_USERNAME}/${IMAGE_NAME}:latest"

# Check Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Host "❌ Docker is not running" -ForegroundColor Red
    Write-Host "   Please start Docker Desktop" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Docker is running" -ForegroundColor Green
Write-Host ""

# Build image
Write-Host "🔨 Building Docker image..." -ForegroundColor Cyan
docker build -f Dockerfile.direct -t ${IMAGE_NAME}:latest .

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Build successful!" -ForegroundColor Green
Write-Host ""

# Tag for Docker Hub
Write-Host "🏷️  Tagging for Docker Hub..." -ForegroundColor Cyan
docker tag ${IMAGE_NAME}:latest $FULL_IMAGE

Write-Host "✅ Tagged as: $FULL_IMAGE" -ForegroundColor Green
Write-Host ""

# Login to Docker Hub
Write-Host "🔐 Logging into Docker Hub..." -ForegroundColor Cyan
Write-Host "   Username: $DOCKER_USERNAME" -ForegroundColor Gray
Write-Host ""
Write-Host "   Enter your Docker Hub password when prompted" -ForegroundColor Yellow
Write-Host "   (Create account at https://hub.docker.com if needed)" -ForegroundColor Gray
Write-Host ""

docker login --username $DOCKER_USERNAME

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Login failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Logged in successfully!" -ForegroundColor Green
Write-Host ""

# Push to Docker Hub
Write-Host "📤 Pushing to Docker Hub..." -ForegroundColor Cyan
Write-Host "   This may take a few minutes..." -ForegroundColor Gray
Write-Host ""

docker push $FULL_IMAGE

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Push failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "✅ SUCCESS! Image pushed to Docker Hub" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📦 Your image is now public at:" -ForegroundColor Cyan
Write-Host "   $FULL_IMAGE" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Deploy on Render:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Go to: https://dashboard.render.com" -ForegroundColor White
Write-Host "2. Click: New + → Web Service" -ForegroundColor White
Write-Host "3. Select: Deploy an existing image from a registry" -ForegroundColor White
Write-Host "4. Enter image URL:" -ForegroundColor White
Write-Host ""
Write-Host "   $FULL_IMAGE" -ForegroundColor Green
Write-Host ""
Write-Host "5. Configure:" -ForegroundColor White
Write-Host "   - Name: decrown-worker-transportation" -ForegroundColor Gray
Write-Host "   - Region: Oregon (US West)" -ForegroundColor Gray
Write-Host "   - Instance Type: Free" -ForegroundColor Gray
Write-Host "   - Port: 3000" -ForegroundColor Gray
Write-Host "   - Health Check Path: /health" -ForegroundColor Gray
Write-Host ""
Write-Host "6. Add Environment Variables:" -ForegroundColor White
Write-Host "   - NODE_ENV = production" -ForegroundColor Gray
Write-Host "   - PORT = 3000" -ForegroundColor Gray
Write-Host ""
Write-Host "7. Click: Create Web Service" -ForegroundColor White
Write-Host ""
Write-Host "🌐 Your app will be live at:" -ForegroundColor Cyan
Write-Host "   https://decrown-worker-transportation.onrender.com" -ForegroundColor Green
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
