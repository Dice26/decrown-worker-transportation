# Create Render Web Service using API
$RENDER_API_KEY = "rnd_N0OYrEvNs85P18jfe9md5nBwXGGa"
$DOCKER_IMAGE = "dice26/decrown:latest"

$headers = @{
    "Authorization" = "Bearer $RENDER_API_KEY"
    "Content-Type" = "application/json"
}

$body = @{
    type = "web_service"
    name = "decrown-worker-transportation"
    ownerId = "usr-"
    repo = ""
    autoDeploy = "no"
    image = @{
        ownerId = ""
        imagePath = $DOCKER_IMAGE
    }
    serviceDetails = @{
        env = "image"
        region = "oregon"
        plan = "free"
        healthCheckPath = "/health"
        envVars = @(
            @{
                key = "NODE_ENV"
                value = "production"
            },
            @{
                key = "PORT"
                value = "3000"
            }
        )
    }
} | ConvertTo-Json -Depth 10

Write-Host "🚀 Creating Render service..." -ForegroundColor Cyan
Write-Host "   Image: $DOCKER_IMAGE" -ForegroundColor White
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "https://api.render.com/v1/services" -Method Post -Headers $headers -Body $body
    Write-Host "✅ Service created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🌐 Your service:" -ForegroundColor Cyan
    Write-Host "   URL: $($response.service.serviceDetails.url)" -ForegroundColor White
    Write-Host "   Dashboard: https://dashboard.render.com/web/$($response.service.id)" -ForegroundColor White
} catch {
    Write-Host "⚠️  API creation failed, use manual method:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Go to: https://dashboard.render.com" -ForegroundColor White
    Write-Host "Click: New + → Web Service → Deploy existing image" -ForegroundColor White
    Write-Host "Enter: dice26/decrown:latest" -ForegroundColor Green
    Write-Host ""
    Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor Red
}
