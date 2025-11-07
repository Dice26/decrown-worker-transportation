#!/bin/bash

# DeCrown Worker Transportation - Production Deployment Script
set -e

# Configuration
PRODUCTION_DIR="/opt/decrown-transport"
BACKUP_DIR="/opt/backups"
LOG_FILE="/var/log/decrown-deploy.log"
DOCKER_IMAGE="decrown-transport:latest"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

# Function to check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_error "This script should not be run as root for security reasons"
        exit 1
    fi
}

# Function to check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check if production directory exists
    if [ ! -d "$PRODUCTION_DIR" ]; then
        log_error "Production directory $PRODUCTION_DIR does not exist"
        exit 1
    fi
    
    # Check if .env.production exists
    if [ ! -f "$PRODUCTION_DIR/.env.production" ]; then
        log_error "Production environment file not found at $PRODUCTION_DIR/.env.production"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Function to create necessary directories
create_directories() {
    log "Creating necessary directories..."
    
    sudo mkdir -p "$BACKUP_DIR"
    sudo mkdir -p "$PRODUCTION_DIR/data/postgres"
    sudo mkdir -p "$PRODUCTION_DIR/data/redis"
    sudo mkdir -p "$PRODUCTION_DIR/data/prometheus"
    sudo mkdir -p "$PRODUCTION_DIR/data/grafana"
    sudo mkdir -p "$PRODUCTION_DIR/data/alertmanager"
    sudo mkdir -p "$PRODUCTION_DIR/logs"
    sudo mkdir -p "$PRODUCTION_DIR/logs/nginx"
    
    # Set proper permissions
    sudo chown -R $USER:$USER "$PRODUCTION_DIR"
    sudo chown -R $USER:$USER "$BACKUP_DIR"
    
    log_success "Directories created successfully"
}

# Function to validate environment configuration
validate_environment() {
    log "Validating environment configuration..."
    
    # Source the production environment
    set -a
    source "$PRODUCTION_DIR/.env.production"
    set +a
    
    # Check critical environment variables
    if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "CHANGE_THIS_JWT_SECRET_KEY_MINIMUM_32_CHARACTERS_LONG" ]; then
        log_error "JWT_SECRET must be set to a secure value"
        exit 1
    fi
    
    if [ -z "$DB_PASSWORD" ] || [ "$DB_PASSWORD" = "CHANGE_THIS_SECURE_PASSWORD_MIN_16_CHARS" ]; then
        log_error "DB_PASSWORD must be set to a secure value"
        exit 1
    fi
    
    if [ -z "$REDIS_PASSWORD" ] || [ "$REDIS_PASSWORD" = "CHANGE_THIS_REDIS_PASSWORD_MIN_16_CHARS" ]; then
        log_error "REDIS_PASSWORD must be set to a secure value"
        exit 1
    fi
    
    if [ "$PAYMENT_DRY_RUN" = "true" ]; then
        log_warning "Payment system is in dry-run mode"
    fi
    
    log_success "Environment configuration validated"
}

# Function to create backup before deployment
create_backup() {
    log "Creating backup before deployment..."
    
    BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_PATH="$BACKUP_DIR/pre_deploy_$BACKUP_TIMESTAMP"
    
    mkdir -p "$BACKUP_PATH"
    
    # Backup database if running
    if docker-compose -f "$PRODUCTION_DIR/docker-compose.production.yml" ps postgres | grep -q "Up"; then
        log "Backing up database..."
        docker-compose -f "$PRODUCTION_DIR/docker-compose.production.yml" exec -T postgres \
            pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_PATH/database.sql.gz"
    fi
    
    # Backup Redis if running
    if docker-compose -f "$PRODUCTION_DIR/docker-compose.production.yml" ps redis | grep -q "Up"; then
        log "Backing up Redis..."
        docker-compose -f "$PRODUCTION_DIR/docker-compose.production.yml" exec redis redis-cli BGSAVE
        sleep 5
        docker cp $(docker-compose -f "$PRODUCTION_DIR/docker-compose.production.yml" ps -q redis):/data/dump.rdb "$BACKUP_PATH/redis.rdb"
    fi
    
    # Backup configuration files
    cp -r "$PRODUCTION_DIR"/*.yml "$BACKUP_PATH/"
    cp "$PRODUCTION_DIR/.env.production" "$BACKUP_PATH/"
    
    log_success "Backup created at $BACKUP_PATH"
}

# Function to build Docker image
build_image() {
    log "Building Docker image..."
    
    cd "$PRODUCTION_DIR"
    
    # Build the production image
    docker build -t "$DOCKER_IMAGE" .
    
    # Tag with timestamp
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    docker tag "$DOCKER_IMAGE" "decrown-transport:$TIMESTAMP"
    
    log_success "Docker image built successfully"
}

# Function to deploy application
deploy_application() {
    log "Deploying application..."
    
    cd "$PRODUCTION_DIR"
    
    # Copy environment file
    cp .env.production .env
    
    # Deploy using production compose file
    docker-compose -f docker-compose.production.yml down
    docker-compose -f docker-compose.production.yml pull
    docker-compose -f docker-compose.production.yml up -d
    
    log_success "Application deployed"
}

# Function to run database migrations
run_migrations() {
    log "Running database migrations..."
    
    # Wait for database to be ready
    sleep 30
    
    # Run migrations
    docker-compose -f "$PRODUCTION_DIR/docker-compose.production.yml" exec -T app npm run migrate
    
    log_success "Database migrations completed"
}

# Function to verify deployment
verify_deployment() {
    log "Verifying deployment..."
    
    # Wait for services to start
    sleep 60
    
    # Check application health
    for i in {1..30}; do
        if curl -f -s http://localhost:3000/health > /dev/null; then
            log_success "Application health check passed"
            break
        fi
        
        if [ $i -eq 30 ]; then
            log_error "Application health check failed after 30 attempts"
            return 1
        fi
        
        log "Waiting for application to be ready... (attempt $i/30)"
        sleep 10
    done
    
    # Check database connectivity
    if docker-compose -f "$PRODUCTION_DIR/docker-compose.production.yml" exec -T postgres \
        psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null; then
        log_success "Database connectivity verified"
    else
        log_error "Database connectivity check failed"
        return 1
    fi
    
    # Check Redis connectivity
    if docker-compose -f "$PRODUCTION_DIR/docker-compose.production.yml" exec -T redis \
        redis-cli -a "$REDIS_PASSWORD" ping | grep -q "PONG"; then
        log_success "Redis connectivity verified"
    else
        log_error "Redis connectivity check failed"
        return 1
    fi
    
    # Check monitoring services
    if curl -f -s http://localhost:9090/-/healthy > /dev/null; then
        log_success "Prometheus is healthy"
    else
        log_warning "Prometheus health check failed"
    fi
    
    if curl -f -s http://localhost:3001/api/health > /dev/null; then
        log_success "Grafana is healthy"
    else
        log_warning "Grafana health check failed"
    fi
    
    log_success "Deployment verification completed"
}

# Function to setup SSL certificates
setup_ssl() {
    log "Setting up SSL certificates..."
    
    # Check if certificates exist
    if [ ! -f "/etc/ssl/certs/decrown.crt" ] || [ ! -f "/etc/ssl/private/decrown.key" ]; then
        log_warning "SSL certificates not found. Please install SSL certificates before enabling HTTPS"
        log "You can use Let's Encrypt: sudo certbot certonly --standalone -d yourdomain.com"
        return 1
    fi
    
    log_success "SSL certificates found"
}

# Function to configure firewall
configure_firewall() {
    log "Configuring firewall..."
    
    # Check if UFW is installed
    if command -v ufw &> /dev/null; then
        sudo ufw --force reset
        sudo ufw default deny incoming
        sudo ufw default allow outgoing
        sudo ufw allow ssh
        sudo ufw allow 80/tcp
        sudo ufw allow 443/tcp
        sudo ufw --force enable
        log_success "Firewall configured"
    else
        log_warning "UFW not installed. Please configure firewall manually"
    fi
}

# Function to setup monitoring
setup_monitoring() {
    log "Setting up monitoring..."
    
    # Wait for Prometheus to be ready
    sleep 30
    
    # Import Grafana dashboards (if available)
    if [ -d "$PRODUCTION_DIR/docker/grafana/dashboards" ]; then
        log "Grafana dashboards will be automatically loaded"
    fi
    
    log_success "Monitoring setup completed"
}

# Function to setup log rotation
setup_log_rotation() {
    log "Setting up log rotation..."
    
    cat > /tmp/decrown-logrotate << EOF
$PRODUCTION_DIR/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        docker-compose -f $PRODUCTION_DIR/docker-compose.production.yml restart app
    endscript
}

$PRODUCTION_DIR/logs/nginx/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        docker-compose -f $PRODUCTION_DIR/docker-compose.production.yml exec nginx nginx -s reload
    endscript
}
EOF

    sudo mv /tmp/decrown-logrotate /etc/logrotate.d/decrown
    sudo chown root:root /etc/logrotate.d/decrown
    sudo chmod 644 /etc/logrotate.d/decrown
    
    log_success "Log rotation configured"
}

# Function to setup automated backups
setup_automated_backups() {
    log "Setting up automated backups..."
    
    cat > /tmp/backup-script.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups"
PRODUCTION_DIR="/opt/decrown-transport"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Database backup
docker-compose -f "$PRODUCTION_DIR/docker-compose.production.yml" exec -T postgres \
    pg_dump -U decrown_user decrown_transport_prod | gzip > "$BACKUP_DIR/db_backup_$DATE.sql.gz"

# Redis backup
docker-compose -f "$PRODUCTION_DIR/docker-compose.production.yml" exec redis redis-cli -a "$REDIS_PASSWORD" BGSAVE
sleep 10
docker cp $(docker-compose -f "$PRODUCTION_DIR/docker-compose.production.yml" ps -q redis):/data/dump.rdb "$BACKUP_DIR/redis_backup_$DATE.rdb"

# Application logs backup
tar -czf "$BACKUP_DIR/logs_backup_$DATE.tar.gz" -C "$PRODUCTION_DIR" logs/

# Cleanup old backups (keep 30 days)
find "$BACKUP_DIR" -name "*.gz" -mtime +30 -delete
find "$BACKUP_DIR" -name "*.rdb" -mtime +30 -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
EOF

    sudo mv /tmp/backup-script.sh /usr/local/bin/decrown-backup.sh
    sudo chmod +x /usr/local/bin/decrown-backup.sh
    
    # Add to crontab
    (crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/decrown-backup.sh") | crontab -
    
    log_success "Automated backups configured"
}

# Function to display deployment summary
display_summary() {
    log_success "=== DEPLOYMENT COMPLETED SUCCESSFULLY ==="
    echo ""
    echo "🚀 DeCrown Worker Transportation is now running in production!"
    echo ""
    echo "📊 Service URLs:"
    echo "   • Application: https://yourdomain.com"
    echo "   • Health Check: https://yourdomain.com/health"
    echo "   • Metrics: http://localhost:9090 (Prometheus)"
    echo "   • Dashboards: http://localhost:3001 (Grafana)"
    echo "   • Alerts: http://localhost:9093 (Alertmanager)"
    echo ""
    echo "📁 Important Paths:"
    echo "   • Application: $PRODUCTION_DIR"
    echo "   • Logs: $PRODUCTION_DIR/logs"
    echo "   • Backups: $BACKUP_DIR"
    echo "   • Deploy Log: $LOG_FILE"
    echo ""
    echo "🔧 Management Commands:"
    echo "   • View logs: docker-compose -f $PRODUCTION_DIR/docker-compose.production.yml logs -f"
    echo "   • Restart: docker-compose -f $PRODUCTION_DIR/docker-compose.production.yml restart"
    echo "   • Stop: docker-compose -f $PRODUCTION_DIR/docker-compose.production.yml down"
    echo "   • Backup: /usr/local/bin/decrown-backup.sh"
    echo ""
    echo "⚠️  Next Steps:"
    echo "   1. Update DNS records to point to this server"
    echo "   2. Configure SSL certificates if not already done"
    echo "   3. Update Slack webhook URLs in alertmanager configuration"
    echo "   4. Test payment processing in dry-run mode first"
    echo "   5. Configure monitoring alerts for your team"
    echo ""
    echo "📞 Support: Check logs and monitoring dashboards for any issues"
}

# Main deployment function
main() {
    log "Starting DeCrown Worker Transportation production deployment..."
    
    check_root
    check_prerequisites
    create_directories
    validate_environment
    create_backup
    build_image
    deploy_application
    run_migrations
    
    if verify_deployment; then
        setup_ssl || log_warning "SSL setup skipped - configure manually"
        configure_firewall
        setup_monitoring
        setup_log_rotation
        setup_automated_backups
        display_summary
    else
        log_error "Deployment verification failed. Check logs and fix issues."
        exit 1
    fi
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "backup")
        create_backup
        ;;
    "verify")
        verify_deployment
        ;;
    "help")
        echo "Usage: $0 [deploy|backup|verify|help]"
        echo "  deploy  - Full production deployment (default)"
        echo "  backup  - Create backup only"
        echo "  verify  - Verify current deployment"
        echo "  help    - Show this help message"
        ;;
    *)
        echo "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac