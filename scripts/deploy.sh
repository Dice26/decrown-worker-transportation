#!/bin/bash

# Blue-Green Deployment Script for DeCrown Worker Transport
set -e

# Configuration
DOCKER_REGISTRY="ghcr.io"
IMAGE_NAME="decrown-workers-transportation"
HEALTH_CHECK_URL="http://localhost:3000/health"
DEPLOYMENT_TIMEOUT=300 # 5 minutes

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if a service is healthy
check_health() {
    local url=$1
    local max_attempts=30
    local attempt=1
    
    log_info "Checking health at $url"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "$url" > /dev/null 2>&1; then
            log_success "Health check passed"
            return 0
        fi
        
        log_info "Health check attempt $attempt/$max_attempts failed, retrying in 10 seconds..."
        sleep 10
        ((attempt++))
    done
    
    log_error "Health check failed after $max_attempts attempts"
    return 1
}

# Function to get current active environment
get_active_environment() {
    if docker-compose -f docker-compose.blue.yml ps | grep -q "Up"; then
        echo "blue"
    elif docker-compose -f docker-compose.green.yml ps | grep -q "Up"; then
        echo "green"
    else
        echo "none"
    fi
}

# Function to deploy to specific environment
deploy_environment() {
    local env=$1
    local image_tag=$2
    
    log_info "Deploying to $env environment with image tag: $image_tag"
    
    # Set environment variables
    export IMAGE_TAG=$image_tag
    export ENVIRONMENT=$env
    
    # Deploy to the target environment
    docker-compose -f docker-compose.$env.yml down
    docker-compose -f docker-compose.$env.yml pull
    docker-compose -f docker-compose.$env.yml up -d
    
    # Wait for services to start
    sleep 30
    
    # Check health
    local health_url
    if [ "$env" = "blue" ]; then
        health_url="http://localhost:3000/health"
    else
        health_url="http://localhost:3001/health"
    fi
    
    if check_health "$health_url"; then
        log_success "$env environment deployed successfully"
        return 0
    else
        log_error "$env environment deployment failed health check"
        return 1
    fi
}

# Function to switch traffic
switch_traffic() {
    local target_env=$1
    
    log_info "Switching traffic to $target_env environment"
    
    # Update nginx configuration to point to new environment
    if [ "$target_env" = "blue" ]; then
        sed -i 's/server green:3000/server blue:3000/g' docker/nginx/nginx.conf
    else
        sed -i 's/server blue:3000/server green:3000/g' docker/nginx/nginx.conf
    fi
    
    # Reload nginx
    docker-compose exec nginx nginx -s reload
    
    log_success "Traffic switched to $target_env environment"
}

# Function to cleanup old environment
cleanup_environment() {
    local env=$1
    
    log_info "Cleaning up $env environment"
    docker-compose -f docker-compose.$env.yml down
    log_success "$env environment cleaned up"
}

# Function to rollback deployment
rollback() {
    local current_env=$1
    local previous_env=$2
    
    log_warning "Rolling back from $current_env to $previous_env"
    
    # Switch traffic back
    switch_traffic "$previous_env"
    
    # Start previous environment if not running
    docker-compose -f docker-compose.$previous_env.yml up -d
    
    # Verify rollback
    local health_url
    if [ "$previous_env" = "blue" ]; then
        health_url="http://localhost:3000/health"
    else
        health_url="http://localhost:3001/health"
    fi
    
    if check_health "$health_url"; then
        log_success "Rollback to $previous_env completed successfully"
        cleanup_environment "$current_env"
    else
        log_error "Rollback failed - manual intervention required"
        exit 1
    fi
}

# Main deployment function
main() {
    local image_tag=${1:-latest}
    local force_environment=${2:-""}
    
    log_info "Starting blue-green deployment"
    log_info "Image tag: $image_tag"
    
    # Get current active environment
    local current_env=$(get_active_environment)
    log_info "Current active environment: $current_env"
    
    # Determine target environment
    local target_env
    if [ -n "$force_environment" ]; then
        target_env=$force_environment
    elif [ "$current_env" = "blue" ]; then
        target_env="green"
    elif [ "$current_env" = "green" ]; then
        target_env="blue"
    else
        target_env="blue" # Default to blue if none active
    fi
    
    log_info "Target environment: $target_env"
    
    # Create backup before deployment
    log_info "Creating backup before deployment"
    if command -v docker-compose &> /dev/null; then
        docker-compose exec app npm run backup:create || log_warning "Backup creation failed"
    fi
    
    # Deploy to target environment
    if deploy_environment "$target_env" "$image_tag"; then
        log_success "Deployment to $target_env successful"
        
        # Switch traffic to new environment
        switch_traffic "$target_env"
        
        # Wait a bit and verify the switch worked
        sleep 10
        local main_health_url="http://localhost/health"
        if check_health "$main_health_url"; then
            log_success "Traffic switch verified"
            
            # Cleanup old environment if it exists
            if [ "$current_env" != "none" ] && [ "$current_env" != "$target_env" ]; then
                cleanup_environment "$current_env"
            fi
            
            log_success "Blue-green deployment completed successfully"
        else
            log_error "Traffic switch verification failed"
            rollback "$target_env" "$current_env"
        fi
    else
        log_error "Deployment to $target_env failed"
        
        # If current environment exists, ensure it's still running
        if [ "$current_env" != "none" ]; then
            log_info "Ensuring $current_env environment is still running"
            docker-compose -f docker-compose.$current_env.yml up -d
        fi
        
        exit 1
    fi
}

# Function to show usage
usage() {
    echo "Usage: $0 [IMAGE_TAG] [ENVIRONMENT]"
    echo ""
    echo "Arguments:"
    echo "  IMAGE_TAG    Docker image tag to deploy (default: latest)"
    echo "  ENVIRONMENT  Force deployment to specific environment (blue|green)"
    echo ""
    echo "Examples:"
    echo "  $0                    # Deploy latest to opposite of current environment"
    echo "  $0 v1.2.3            # Deploy v1.2.3 to opposite of current environment"
    echo "  $0 latest blue        # Force deploy latest to blue environment"
    echo ""
    echo "Commands:"
    echo "  $0 status             # Show current deployment status"
    echo "  $0 rollback           # Rollback to previous environment"
    echo "  $0 cleanup            # Cleanup unused environments"
}

# Handle special commands
case "$1" in
    "help"|"-h"|"--help")
        usage
        exit 0
        ;;
    "status")
        current_env=$(get_active_environment)
        log_info "Current active environment: $current_env"
        if [ "$current_env" != "none" ]; then
            docker-compose -f docker-compose.$current_env.yml ps
        fi
        exit 0
        ;;
    "rollback")
        current_env=$(get_active_environment)
        if [ "$current_env" = "blue" ]; then
            rollback "blue" "green"
        elif [ "$current_env" = "green" ]; then
            rollback "green" "blue"
        else
            log_error "No active environment to rollback from"
            exit 1
        fi
        exit 0
        ;;
    "cleanup")
        log_info "Cleaning up all environments"
        docker-compose -f docker-compose.blue.yml down
        docker-compose -f docker-compose.green.yml down
        docker system prune -f
        log_success "Cleanup completed"
        exit 0
        ;;
esac

# Run main deployment
main "$@"