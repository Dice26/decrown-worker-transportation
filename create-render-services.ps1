# DeCrown - Create Render Services for Userfront and Adminfront
# PowerShell script to create services via Render API

param(
    [Parameter(Mandatory=$true)]
    [string]$RenderApiKey
)

$headers = @{
    "Authorization" = "Bearer $RenderApiKey"
    "Content-Type" = "application/json"
}

Write-Host "🚀 Creating DeCrown Services on Render..." -ForegroundColor Cyan
Write-Host ""

# Create Userfront Service
Write-Host "📱 Creating Userfront (Worker Interface)..." -ForegroundColor Yellow

$userfrontBody = @{
    type = "web"
    name = "decrown-userfront"
    env = "docker"
    image = @{
        url = "dice26/decrown-userfront:latest"
    }
    plan = "free"
    region = "oregon"
    autoDeploy = $true
    envVars = @(
        @{
            key = "NODE_ENV"
            value = "production"
        },
        @{
            key = "PORT"
            value = "10000"
        },
        @{
            key = "API_URL"
            value = "https://decrown-worker-transportation.onrender.com"
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $userfrontResponse = Invoke-RestMethod -Uri "https://api.render.com/v1/services" `
        -Method POST `
        -Headers $headers `
        -Body $userfrontBody

    Write-Host "✅ Userfront created successfully!" -ForegroundColor Green
    Write-Host "   Service ID: $($userfrontResponse.service.id)" -ForegroundColor Gray
    Write-Host "   URL: https://$($userfrontResponse.service.name).onrender.com" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Failed to create Userfront: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Create Adminfront Service
Write-Host "🎛️  Creating Adminfront (Dispatcher/Owner Interface)..." -ForegroundColor Yellow

$adminfrontBody = @{
    type = "web"
    name = "decrown-adminfront"
    env = "docker"
    image = @{
        url = "dice26/decrown-adminfront:latest"
    }
    plan = "free"
    region = "oregon"
    autoDeploy = $true
    envVars = @(
        @{
            key = "NODE_ENV"
            value = "production"
        },
        @{
            key = "PORT"
            value = "10000"
        },
        @{
            key = "API_URL"
            value = "https://decrown-worker-transportation.onrender.com"
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $adminfrontResponse = Invoke-RestMethod -Uri "https://api.render.com/v1/services" `
        -Method POST `
        -Headers $headers `
        -Body $adminfrontBody

    Write-Host "✅ Adminfront created successfully!" -ForegroundColor Green
    Write-Host "   Service ID: $($adminfrontResponse.service.id)" -ForegroundColor Gray
    Write-Host "   URL: https://$($adminfrontResponse.service.name).onrender.com" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Failed to create Adminfront: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

Write-Host "🎉 Deployment initiated!" -ForegroundColor Cyan
Write-Host ""
Write-Host "📊 Your DeCrown System URLs:" -ForegroundColor White
Write-Host "   1. Frontend:  https://decrown-frontend.onrender.com" -ForegroundColor Gray
Write-Host "   2. Backend:   https://decrown-worker-transportation.onrender.com" -ForegroundColor Gray
Write-Host "   3. Userfront: https://decrown-userfront.onrender.com" -ForegroundColor Gray
Write-Host "   4. Adminfront: https://decrown-adminfront.onrender.com" -ForegroundColor Gray
Write-Host ""
Write-Host "⏳ Services will be live in 2-3 minutes. Check Render dashboard for status." -ForegroundColor Yellow
