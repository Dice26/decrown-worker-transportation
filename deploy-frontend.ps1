# Deploy Frontend to Docker Hub and Render

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "🎨 DeCrown Frontend Deployment" -ForegroundColor Green
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

$DOCKER_USERNAME = "dice26"
$IMAGE_NAME = "decrown-frontend"
$FULL_IMAGE = "${DOCKER_USERNAME}/${IMAGE_NAME}:latest"

# Check Docker
try {
    docker info | Out-Null
} catch {
    Write-Host "❌ Docker is not running" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Docker is running" -ForegroundColor Green
Write-Host ""

# Navigate to frontend directory
Set-Location frontend

# Build image
Write-Host "🔨 Building frontend Docker image..." -ForegroundColor Cyan
docker build -t ${IMAGE_NAME}:latest .

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    Set-Location ..
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
$password = "Dice@4321"
echo $password | docker login --username $DOCKER_USERNAME --password-stdin

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Login failed" -ForegroundColor Red
    Set-Location ..
    exit 1
}

Write-Host "✅ Logged in successfully!" -ForegroundColor Green
Write-Host ""

# Push to Docker Hub
Write-Host "📤 Pushing frontend to Docker Hub..." -ForegroundColor Cyan
docker push $FULL_IMAGE

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Push failed" -ForegroundColor Red
    Set-Location ..
    exit 1
}

Set-Location ..

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "✅ FRONTEND DEPLOYED TO DOCKER HUB!" -ForegroundColor Green
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""
Write-Host "📦 Frontend Image:" -ForegroundColor Cyan
Write-Host "   $FULL_IMAGE" -ForegroundColor White
Write-Host ""
Write-Host "🔗 View on Docker Hub:" -ForegroundColor Cyan
Write-Host "   https://hub.docker.com/r/$DOCKER_USERNAME/$IMAGE_NAME" -ForegroundColor White
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
Write-Host "   • Name: decrown-frontend" -ForegroundColor Gray
Write-Host "   • Region: Oregon (US West)" -ForegroundColor Gray
Write-Host "   • Instance Type: Free" -ForegroundColor Gray
Write-Host "   • Port: 80" -ForegroundColor Gray
Write-Host "   • Health Check Path: /health" -ForegroundColor Gray
Write-Host ""
Write-Host "6. Click: Create Web Service" -ForegroundColor White
Write-Host ""
Write-Host "🌐 Your frontend will be live at:" -ForegroundColor Cyan
Write-Host "   https://decrown-frontend.onrender.com" -ForegroundColor Green
Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""
