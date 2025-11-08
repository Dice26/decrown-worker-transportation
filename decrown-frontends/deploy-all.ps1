# Deploy All DeCrown Frontend Applications

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=" * 80 -ForegroundColor Green
Write-Host "🚀 DeCrown Frontends - Complete Deployment" -ForegroundColor Green
Write-Host "=" * 80 -ForegroundColor Green
Write-Host ""

# Check Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Host "❌ Docker is not running" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Docker is running" -ForegroundColor Green
Write-Host ""

# Login to Docker Hub
Write-Host "🔐 Logging into Docker Hub..." -ForegroundColor Cyan
$password = "Dice@4321"
echo $password | docker login --username dice26 --password-stdin

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Login failed" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Logged in successfully!" -ForegroundColor Green
Write-Host ""

# Push Admin Dashboard
Write-Host "📤 Pushing Admin Dashboard..." -ForegroundColor Cyan
docker push dice26/decrown-admin:latest

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Admin dashboard push failed" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Admin dashboard pushed!" -ForegroundColor Green
Write-Host ""

# Push Mobile Apps
Write-Host "📤 Pushing Mobile Apps..." -ForegroundColor Cyan
docker push dice26/decrown-mobile:latest

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Mobile apps push failed" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Mobile apps pushed!" -ForegroundColor Green
Write-Host ""

Write-Host "=" * 80 -ForegroundColor Green
Write-Host "✅ ALL APPLICATIONS DEPLOYED TO DOCKER HUB!" -ForegroundColor Green
Write-Host "=" * 80 -ForegroundColor Green
Write-Host ""

Write-Host "📦 Deployed Images:" -ForegroundColor Cyan
Write-Host "   • dice26/decrown-admin:latest" -ForegroundColor White
Write-Host "   • dice26/decrown-mobile:latest" -ForegroundColor White
Write-Host ""

Write-Host "🌐 Deploy on Render:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Admin Dashboard:" -ForegroundColor White
Write-Host "   1. Go to: https://dashboard.render.com" -ForegroundColor Gray
Write-Host "   2. New + → Web Service → Deploy existing image" -ForegroundColor Gray
Write-Host "   3. Image: dice26/decrown-admin:latest" -ForegroundColor Green
Write-Host "   4. Port: 80, Health: /health" -ForegroundColor Gray
Write-Host "   5. Domain: app.gowithdecrown.com" -ForegroundColor Gray
Write-Host ""

Write-Host "Mobile Apps:" -ForegroundColor White
Write-Host "   1. Go to: https://dashboard.render.com" -ForegroundColor Gray
Write-Host "   2. New + → Web Service → Deploy existing image" -ForegroundColor Gray
Write-Host "   3. Image: dice26/decrown-mobile:latest" -ForegroundColor Green
Write-Host "   4. Port: 80, Health: /health" -ForegroundColor Gray
Write-Host "   5. Domain: mobile.gowithdecrown.com" -ForegroundColor Gray
Write-Host ""

Write-Host "=" * 80 -ForegroundColor Green
Write-Host ""
