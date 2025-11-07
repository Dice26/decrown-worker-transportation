# DeCrown Worker Transportation - Render Deployment Script
# Domain: www.gowithdecrown.com

Write-Host "🚀 DeCrown Worker Transportation - Render Deployment" -ForegroundColor Green
Write-Host "Domain: www.gowithdecrown.com" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if Git is installed
Write-Host "📋 Step 1: Checking Git installation..." -ForegroundColor Cyan
try {
    $gitVersion = git --version
    Write-Host "✅ Git is installed: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Git is not installed. Please install Git first." -ForegroundColor Red
    Write-Host "Download from: https://git-scm.com/download/win" -ForegroundColor Yellow
    exit 1
}

# Step 2: Initialize Git repository
Write-Host ""
Write-Host "📋 Step 2: Initializing Git repository..." -ForegroundColor Cyan
if (Test-Path ".git") {
    Write-Host "✅ Git repository already initialized" -ForegroundColor Green
} else {
    git init
    Write-Host "✅ Git repository initialized" -ForegroundColor Green
}

# Step 3: Add all files
Write-Host ""
Write-Host "📋 Step 3: Adding files to Git..." -ForegroundColor Cyan
git add .
Write-Host "✅ Files added to Git" -ForegroundColor Green

# Step 4: Commit changes
Write-Host ""
Write-Host "📋 Step 4: Committing changes..." -ForegroundColor Cyan
$commitMessage = "Deploy DeCrown Worker Transportation to Render - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
git commit -m $commitMessage
Write-Host "✅ Changes committed" -ForegroundColor Green

# Step 5: Check for remote
Write-Host ""
Write-Host "📋 Step 5: Checking GitHub remote..." -ForegroundColor Cyan
$remoteUrl = git remote get-url origin 2>$null

if ($remoteUrl) {
    Write-Host "✅ GitHub remote already configured: $remoteUrl" -ForegroundColor Green
    
    # Ask if user wants to push
    Write-Host ""
    $push = Read-Host "Do you want to push to GitHub now? (Y/N)"
    if ($push -eq "Y" -or $push -eq "y") {
        Write-Host "📤 Pushing to GitHub..." -ForegroundColor Cyan
        git push -u origin main
        Write-Host "✅ Pushed to GitHub successfully!" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  No GitHub remote configured" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please follow these steps:" -ForegroundColor Yellow
    Write-Host "1. Go to https://github.com/new" -ForegroundColor White
    Write-Host "2. Create a new repository named: decrown-worker-transportation" -ForegroundColor White
    Write-Host "3. Copy the repository URL" -ForegroundColor White
    Write-Host ""
    
    $repoUrl = Read-Host "Enter your GitHub repository URL (or press Enter to skip)"
    
    if ($repoUrl) {
        git remote add origin $repoUrl
        git branch -M main
        Write-Host "📤 Pushing to GitHub..." -ForegroundColor Cyan
        git push -u origin main
        Write-Host "✅ Pushed to GitHub successfully!" -ForegroundColor Green
    } else {
        Write-Host "⏭️  Skipped GitHub push. You can do this manually later." -ForegroundColor Yellow
    }
}

# Step 6: Display next steps
Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "🎉 Git Setup Complete!" -ForegroundColor Green
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 NEXT STEPS TO DEPLOY ON RENDER:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Go to https://render.com and sign up/login" -ForegroundColor White
Write-Host "2. Click 'New +' → 'Blueprint'" -ForegroundColor White
Write-Host "3. Connect your GitHub repository: decrown-worker-transportation" -ForegroundColor White
Write-Host "4. Click 'Apply' - Render will automatically:" -ForegroundColor White
Write-Host "   - Create PostgreSQL database" -ForegroundColor Gray
Write-Host "   - Create Redis cache" -ForegroundColor Gray
Write-Host "   - Deploy your application" -ForegroundColor Gray
Write-Host "   - Provide free SSL certificate" -ForegroundColor Gray
Write-Host ""
Write-Host "5. Your app will be live at:" -ForegroundColor White
Write-Host "   https://decrown-worker-transportation.onrender.com" -ForegroundColor Cyan
Write-Host ""
Write-Host "6. To add custom domain (www.gowithdecrown.com):" -ForegroundColor White
Write-Host "   - Go to Settings → Custom Domains" -ForegroundColor Gray
Write-Host "   - Add: www.gowithdecrown.com" -ForegroundColor Gray
Write-Host "   - Update DNS records at your domain registrar" -ForegroundColor Gray
Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""
Write-Host "📚 Full deployment guide: RENDER_DEPLOYMENT_GUIDE.md" -ForegroundColor Yellow
Write-Host ""
Write-Host "🚀 Ready to go live at www.gowithdecrown.com!" -ForegroundColor Green
Write-Host ""

# Ask if user wants to open Render
$openRender = Read-Host "Do you want to open Render.com now? (Y/N)"
if ($openRender -eq "Y" -or $openRender -eq "y") {
    Start-Process "https://render.com/new/blueprint"
}