# DeCrown Worker Transportation - Simple Render Deployment
Write-Host "🚀 DeCrown Worker Transportation - Render Deployment" -ForegroundColor Green
Write-Host ""

# Check Git
Write-Host "Checking Git..." -ForegroundColor Cyan
git --version

# Initialize Git
Write-Host ""
Write-Host "Initializing Git repository..." -ForegroundColor Cyan
if (-not (Test-Path ".git")) {
    git init
    Write-Host "✅ Git initialized" -ForegroundColor Green
} else {
    Write-Host "✅ Git already initialized" -ForegroundColor Green
}

# Add files
Write-Host ""
Write-Host "Adding files..." -ForegroundColor Cyan
git add .
Write-Host "✅ Files added" -ForegroundColor Green

# Commit
Write-Host ""
Write-Host "Committing changes..." -ForegroundColor Cyan
git commit -m "Deploy DeCrown Worker Transportation to Render"
Write-Host "✅ Changes committed" -ForegroundColor Green

# Instructions
Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Create GitHub repository at: https://github.com/new" -ForegroundColor White
Write-Host "   Repository name: decrown-worker-transportation" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Run these commands with your GitHub URL:" -ForegroundColor White
Write-Host "   git remote add origin YOUR_GITHUB_URL" -ForegroundColor Gray
Write-Host "   git branch -M main" -ForegroundColor Gray
Write-Host "   git push -u origin main" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Deploy on Render:" -ForegroundColor White
Write-Host "   - Go to https://render.com" -ForegroundColor Gray
Write-Host "   - Click 'New +' → 'Blueprint'" -ForegroundColor Gray
Write-Host "   - Connect your GitHub repo" -ForegroundColor Gray
Write-Host "   - Click 'Apply'" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Your app will be live at:" -ForegroundColor White
Write-Host "   https://decrown-worker-transportation.onrender.com" -ForegroundColor Cyan
Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""
Write-Host "📚 Full guide: RENDER_DEPLOYMENT_GUIDE.md" -ForegroundColor Yellow
Write-Host "⚡ Quick start: QUICK_START_RENDER.md" -ForegroundColor Yellow
Write-Host ""