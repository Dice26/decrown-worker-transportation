# DeCrown Worker Transportation - Docker Deploy Script (PowerShell)
# This script builds and pushes the Docker image directly to Render

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🐳 DeCrown Docker Deployment" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Host "❌ Error: Docker is not running" -ForegroundColor Red
    Write-Host "   Please start Docker Desktop and try again" -ForegroundColor Yellow
    exit 1
}

# Get Render username
Write-Host "📝 Enter your Render username (or email):" -ForegroundColor Yellow
$RENDER_USERNAME = Read-Host

if ([string]::IsNullOrWhiteSpace($RENDER_USERNAME)) {
    Write-Host "❌ Error: Render username is required" -ForegroundColor Red
    exit 1
}

$IMAGE_NAME = "decrown-worker-transportation"
$RENDER_REGISTRY = "registry.render.com"
$FULL_IMAGE_NAME = "$RENDER_REGISTRY/$RENDER_USERNAME/$IMAGE_NAME"

Write-Host ""
Write-Host "🔨 Building Docker image..." -ForegroundColor Cyan
docker build -f Dockerfile.direct -t ${IMAGE_NAME}:latest .

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Build successful!" -ForegroundColor Green
Write-Host ""
Write-Host "🧪 Testing image locally..." -ForegroundColor Cyan
Write-Host "   Starting container on port 3000..." -ForegroundColor Gray

# Test the image
$CONTAINER_ID = docker run -d -p 3000:3000 ${IMAGE_NAME}:latest

Write-Host "   Waiting for container to start..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# Check health endpoint
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Health check passed!" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Warning: Health check failed, but continuing..." -ForegroundColor Yellow
}

# Stop test container
docker stop $CONTAINER_ID | Out-Null
docker rm $CONTAINER_ID | Out-Null

Write-Host ""
Write-Host "🏷️  Tagging image for Render..." -ForegroundColor Cyan
docker tag ${IMAGE_NAME}:latest ${FULL_IMAGE_NAME}:latest

Write-Host ""
Write-Host "🔐 Logging into Render registry..." -ForegroundColor Cyan
Write-Host "   Registry: $RENDER_REGISTRY" -ForegroundColor Gray
Write-Host "   Username: $RENDER_USERNAME" -ForegroundColor Gray
Write-Host ""
Write-Host "   You'll need your Render API key" -ForegroundColor Yellow
Write-Host "   Get it from: https://dashboard.render.com/u/settings#api-keys" -ForegroundColor Yellow
Write-Host ""

docker login $RENDER_REGISTRY

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Login failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📤 Pushing image to Render..." -ForegroundColor Cyan
docker push ${FULL_IMAGE_NAME}:latest

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Push failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "✅ DEPLOYMENT SUCCESSFUL!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📦 Image pushed to:" -ForegroundColor Cyan
Write-Host "   ${FULL_IMAGE_NAME}:latest" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Next Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Go to: https://dashboard.render.com" -ForegroundColor White
Write-Host "2. Click: New + → Web Service" -ForegroundColor White
Write-Host "3. Select: Deploy an existing image from a registry" -ForegroundColor White
Write-Host "4. Enter image URL:" -ForegroundColor White
Write-Host "   ${FULL_IMAGE_NAME}:latest" -ForegroundColor Green
Write-Host ""
Write-Host "5. Configure:" -ForegroundColor White
Write-Host "   - Name: decrown-worker-transportation" -ForegroundColor Gray
Write-Host "   - Region: Oregon (US West)" -ForegroundColor Gray
Write-Host "   - Port: 3000" -ForegroundColor Gray
Write-Host "   - Health Check Path: /health" -ForegroundColor Gray
Write-Host ""
Write-Host "6. Click: Create Web Service" -ForegroundColor White
Write-Host ""
Write-Host "🌐 Your app will be live at:" -ForegroundColor Cyan
Write-Host "   https://decrown-worker-transportation.onrender.com" -ForegroundColor Green
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
