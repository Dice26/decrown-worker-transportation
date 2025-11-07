# Blue-Green Deployment Script for DeCrown Worker Transport (PowerShell)
param(
    [string]$ImageTag = "latest",
    [string]$Environment = "",
    [string]$Command = ""
)

# Configuration
$DOCKER_REGISTRY = "ghcr.io"
$IMAGE_NAME = "decrown-workers-transportation"
$HEALTH_CHECK_URL = "http://localhost:3000/health"
$DEPLOYMENT_TIMEOUT = 300 # 5 minutes

# Logging functions
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Function to check if a service is healthy
function Test-Health {
    param([string]$Url)
    
    $maxAttempts = 30
    $attempt = 1
    
    Write-Info "Checking health at $Url"
    
    while ($attempt -le $maxAttempts) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10
            if ($response.StatusCode -eq 200) {
                Write-Success "Health check passed"
                return $true
            }
        }
        catch {
            # Continue to retry
        }
        
        Write-Info "Health check attempt $attempt/$maxAttempts failed, retrying in 10 seconds..."
        Start-Sleep -Seconds 10
        $attempt++
    }
    
    Write-Error "Health check failed after $maxAttempts attempts"
    return $false
}

# Function to get current active environment
function Get-ActiveEnvironment {
    try {
        $blueStatus = docker-compose -f docker-compose.blue.yml ps 2>$null
        if ($blueStatus -match "Up") {
            return "blue"
        }
        
        $greenStatus = docker-compose -f docker-compose.green.yml ps 2>$null
        if ($greenStatus -match "Up") {
            return "green"
        }
        
        return "none"
    }
    catch {
        return "none"
    }
}

# Function to deploy to specific environment
function Deploy-Environment {
    param(
        [string]$Env,
        [string]$ImageTag
    )
    
    Write-Info "Deploying to $Env environment with image tag: $ImageTag"
    
    # Set environment variables
    $env:IMAGE_TAG = $ImageTag
    $env:ENVIRONMENT = $Env
    
    try {
        # Deploy to the target environment
        docker-compose -f "docker-compose.$Env.yml" down
        docker-compose -f "docker-compose.$Env.yml" pull
        docker-compose -f "docker-compose.$Env.yml" up -d
        
        # Wait for services to start
        Start-Sleep -Seconds 30
        
        # Check health
        $healthUrl = if ($Env -eq "blue") { "http://localhost:3000/health" } else { "http://localhost:3001/health" }
        
        if (Test-Health -Url $healthUrl) {
            Write-Success "$Env environment deployed successfully"
            return $true
        }
        else {
            Write-Error "$Env environment deployment failed health check"
            return $false
        }
    }
    catch {
        Write-Error "Failed to deploy to $Env environment: $($_.Exception.Message)"
        return $false
    }
}

# Function to switch traffic
function Switch-Traffic {
    param([string]$TargetEnv)
    
    Write-Info "Switching traffic to $TargetEnv environment"
    
    try {
        # Update nginx configuration to point to new environment
        $nginxConfig = Get-Content "docker/nginx/nginx.conf" -Raw
        if ($TargetEnv -eq "blue") {
            $nginxConfig = $nginxConfig -replace "server green:3000", "server blue:3000"
        }
        else {
            $nginxConfig = $nginxConfig -replace "server blue:3000", "server green:3000"
        }
        Set-Content "docker/nginx/nginx.conf" -Value $nginxConfig
        
        # Reload nginx
        docker-compose exec nginx nginx -s reload
        
        Write-Success "Traffic switched to $TargetEnv environment"
        return $true
    }
    catch {
        Write-Error "Failed to switch traffic: $($_.Exception.Message)"
        return $false
    }
}

# Function to cleanup old environment
function Remove-Environment {
    param([string]$Env)
    
    Write-Info "Cleaning up $Env environment"
    try {
        docker-compose -f "docker-compose.$Env.yml" down
        Write-Success "$Env environment cleaned up"
        return $true
    }
    catch {
        Write-Error "Failed to cleanup $Env environment: $($_.Exception.Message)"
        return $false
    }
}

# Function to rollback deployment
function Invoke-Rollback {
    param(
        [string]$CurrentEnv,
        [string]$PreviousEnv
    )
    
    Write-Warning "Rolling back from $CurrentEnv to $PreviousEnv"
    
    # Switch traffic back
    if (-not (Switch-Traffic -TargetEnv $PreviousEnv)) {
        Write-Error "Failed to switch traffic during rollback"
        return $false
    }
    
    # Start previous environment if not running
    docker-compose -f "docker-compose.$PreviousEnv.yml" up -d
    
    # Verify rollback
    $healthUrl = if ($PreviousEnv -eq "blue") { "http://localhost:3000/health" } else { "http://localhost:3001/health" }
    
    if (Test-Health -Url $healthUrl) {
        Write-Success "Rollback to $PreviousEnv completed successfully"
        Remove-Environment -Env $CurrentEnv | Out-Null
        return $true
    }
    else {
        Write-Error "Rollback failed - manual intervention required"
        return $false
    }
}

# Main deployment function
function Start-Deployment {
    param(
        [string]$ImageTag,
        [string]$ForceEnvironment
    )
    
    Write-Info "Starting blue-green deployment"
    Write-Info "Image tag: $ImageTag"
    
    # Get current active environment
    $currentEnv = Get-ActiveEnvironment
    Write-Info "Current active environment: $currentEnv"
    
    # Determine target environment
    $targetEnv = if ($ForceEnvironment) {
        $ForceEnvironment
    }
    elseif ($currentEnv -eq "blue") {
        "green"
    }
    elseif ($currentEnv -eq "green") {
        "blue"
    }
    else {
        "blue" # Default to blue if none active
    }
    
    Write-Info "Target environment: $targetEnv"
    
    # Create backup before deployment
    Write-Info "Creating backup before deployment"
    try {
        docker-compose exec app npm run backup:create 2>$null
    }
    catch {
        Write-Warning "Backup creation failed"
    }
    
    # Deploy to target environment
    if (Deploy-Environment -Env $targetEnv -ImageTag $ImageTag) {
        Write-Success "Deployment to $targetEnv successful"
        
        # Switch traffic to new environment
        if (Switch-Traffic -TargetEnv $targetEnv) {
            # Wait a bit and verify the switch worked
            Start-Sleep -Seconds 10
            $mainHealthUrl = "http://localhost/health"
            if (Test-Health -Url $mainHealthUrl) {
                Write-Success "Traffic switch verified"
                
                # Cleanup old environment if it exists
                if ($currentEnv -ne "none" -and $currentEnv -ne $targetEnv) {
                    Remove-Environment -Env $currentEnv | Out-Null
                }
                
                Write-Success "Blue-green deployment completed successfully"
                return $true
            }
            else {
                Write-Error "Traffic switch verification failed"
                Invoke-Rollback -CurrentEnv $targetEnv -PreviousEnv $currentEnv | Out-Null
                return $false
            }
        }
        else {
            Write-Error "Failed to switch traffic"
            return $false
        }
    }
    else {
        Write-Error "Deployment to $targetEnv failed"
        
        # If current environment exists, ensure it's still running
        if ($currentEnv -ne "none") {
            Write-Info "Ensuring $currentEnv environment is still running"
            docker-compose -f "docker-compose.$currentEnv.yml" up -d
        }
        
        return $false
    }
}

# Function to show usage
function Show-Usage {
    Write-Host @"
Usage: .\deploy.ps1 [-ImageTag <tag>] [-Environment <env>] [-Command <cmd>]

Parameters:
  -ImageTag     Docker image tag to deploy (default: latest)
  -Environment  Force deployment to specific environment (blue|green)
  -Command      Special command to run (status|rollback|cleanup|help)

Examples:
  .\deploy.ps1                           # Deploy latest to opposite of current environment
  .\deploy.ps1 -ImageTag v1.2.3          # Deploy v1.2.3 to opposite of current environment
  .\deploy.ps1 -ImageTag latest -Environment blue  # Force deploy latest to blue environment

Commands:
  .\deploy.ps1 -Command status           # Show current deployment status
  .\deploy.ps1 -Command rollback         # Rollback to previous environment
  .\deploy.ps1 -Command cleanup          # Cleanup unused environments
"@
}

# Handle special commands
switch ($Command.ToLower()) {
    "help" {
        Show-Usage
        exit 0
    }
    "status" {
        $currentEnv = Get-ActiveEnvironment
        Write-Info "Current active environment: $currentEnv"
        if ($currentEnv -ne "none") {
            docker-compose -f "docker-compose.$currentEnv.yml" ps
        }
        exit 0
    }
    "rollback" {
        $currentEnv = Get-ActiveEnvironment
        if ($currentEnv -eq "blue") {
            $success = Invoke-Rollback -CurrentEnv "blue" -PreviousEnv "green"
        }
        elseif ($currentEnv -eq "green") {
            $success = Invoke-Rollback -CurrentEnv "green" -PreviousEnv "blue"
        }
        else {
            Write-Error "No active environment to rollback from"
            exit 1
        }
        exit $(if ($success) { 0 } else { 1 })
    }
    "cleanup" {
        Write-Info "Cleaning up all environments"
        docker-compose -f docker-compose.blue.yml down
        docker-compose -f docker-compose.green.yml down
        docker system prune -f
        Write-Success "Cleanup completed"
        exit 0
    }
    "" {
        # No command, proceed with deployment
        break
    }
    default {
        Write-Error "Unknown command: $Command"
        Show-Usage
        exit 1
    }
}

# Run main deployment
$success = Start-Deployment -ImageTag $ImageTag -ForceEnvironment $Environment
exit $(if ($success) { 0 } else { 1 })