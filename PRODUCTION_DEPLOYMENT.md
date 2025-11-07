# DeCrown Worker Transportation - Production Deployment Guide

## 🚀 Production Deployment Checklist

### Pre-Deployment Requirements

#### 1. Infrastructure Prerequisites
- [ ] Production server with Docker and Docker Compose
- [ ] PostgreSQL 15+ with PostGIS and TimescaleDB extensions
- [ ] Redis 7+ instance
- [ ] SSL certificates for HTTPS
- [ ] Domain name configured
- [ ] Load balancer (if multi-instance)

#### 2. Environment Configuration
- [ ] Production environment variables configured
- [ ] Database credentials secured
- [ ] Payment provider keys (Stripe/PayMongo) configured
- [ ] JWT secrets generated
- [ ] KMS keys for encryption configured
- [ ] Monitoring endpoints configured

#### 3. Security Checklist
- [ ] Firewall rules configured
- [ ] Database access restricted
- [ ] Redis access secured
- [ ] SSL/TLS certificates installed
- [ ] Security headers configured
- [ ] Rate limiting configured

## 📋 Production Environment Setup

### Step 1: Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Create application directory
sudo mkdir -p /opt/decrown-transport
sudo chown $USER:$USER /opt/decrown-transport
cd /opt/decrown-transport
```

### Step 2: Environment Configuration

Create production environment file:

```bash
# Create production environment file
cat > .env.production << 'EOF'
# Production Environment Configuration
NODE_ENV=production

# Server Configuration
PORT=3000
HOST=0.0.0.0

# Database Configuration
DB_HOST=postgres
DB_PORT=5432
DB_NAME=decrown_transport_prod
DB_USER=decrown_user
DB_PASSWORD=CHANGE_THIS_SECURE_PASSWORD
DB_SSL=true
DB_POOL_MIN=5
DB_POOL_MAX=20

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=CHANGE_THIS_REDIS_PASSWORD
REDIS_DB=0

# Authentication
JWT_SECRET=CHANGE_THIS_JWT_SECRET_KEY_MINIMUM_32_CHARS
JWT_EXPIRATION=15m
REFRESH_TOKEN_EXPIRATION=7d
BCRYPT_ROUNDS=12

# Payment Configuration
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_live_YOUR_STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET
PAYMENT_DRY_RUN=false

# AWS KMS (for encryption)
AWS_REGION=us-east-1
KMS_KEY_ID=YOUR_KMS_KEY_ID
AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_SECRET_KEY

# Feature Flags
FEATURE_LOCATION_TRACKING=true
FEATURE_REAL_TIME_UPDATES=true
FEATURE_PAYMENT_PROCESSING=true
FEATURE_AUDIT_LOGGING=true
FEATURE_PERFORMANCE_MONITORING=true

# Monitoring
METRICS_ENABLED=true
HEALTH_CHECK_INTERVAL=30000
ALERTING_ENABLED=true
ALERTING_WEBHOOK_URL=YOUR_SLACK_WEBHOOK_URL

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
LOG_FILE_ENABLED=true
LOG_FILE_PATH=/app/logs/app.log
LOG_FILE_MAX_SIZE=10m
LOG_FILE_MAX_FILES=5

# CORS
CORS_ORIGIN=https://yourdomain.com,https://app.yourdomain.com
CORS_CREDENTIALS=true

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Backup Configuration
BACKUP_DIR=/opt/backups
REDIS_DATA_DIR=/data

# SSL Configuration
SSL_CERT_PATH=/etc/ssl/certs/decrown.crt
SSL_KEY_PATH=/etc/ssl/private/decrown.key
EOF
```

### Step 3: SSL Certificate Setup

```bash
# Create SSL directory
sudo mkdir -p /etc/ssl/certs /etc/ssl/private

# Option 1: Let's Encrypt (recommended)
sudo apt install certbot
sudo certbot certonly --standalone -d yourdomain.com -d api.yourdomain.com

# Option 2: Self-signed (development only)
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/decrown.key \
  -out /etc/ssl/certs/decrown.crt
```

### Step 4: Database Setup

```bash
# Create production database configuration
cat > docker/postgres/init-prod.sql << 'EOF'
-- Production database initialization
CREATE DATABASE decrown_transport_prod;
CREATE USER decrown_user WITH ENCRYPTED PASSWORD 'CHANGE_THIS_SECURE_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE decrown_transport_prod TO decrown_user;

-- Connect to the database
\c decrown_transport_prod;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- Grant permissions
GRANT ALL ON SCHEMA public TO decrown_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO decrown_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO decrown_user;
EOF
```

## 🔧 Production Deployment Steps

### Step 1: Clone and Build

```bash
# Clone the repository
git clone https://github.com/your-org/decrown-workers-transportation.git
cd decrown-workers-transportation

# Build production image
docker build -t decrown-transport:latest .

# Verify build
docker images | grep decrown-transport
```

### Step 2: Deploy with Blue-Green Strategy

```bash
# Make deployment script executable
chmod +x scripts/deploy.sh

# Initial deployment to blue environment
./scripts/deploy.sh latest blue

# Verify deployment
curl -f http://localhost:3000/health
```

### Step 3: Database Migration

```bash
# Run database migrations
docker-compose exec app npm run migrate

# Verify database setup
docker-compose exec postgres psql -U decrown_user -d decrown_transport_prod -c "\dt"
```

### Step 4: Load Balancer Configuration (Nginx)

```bash
# Update nginx configuration for production
cat > docker/nginx/nginx-prod.conf << 'EOF'
upstream app_backend {
    server blue:3000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/ssl/certs/decrown.crt;
    ssl_certificate_key /etc/ssl/private/decrown.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;

    location / {
        proxy_pass http://app_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 10s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    location /health {
        proxy_pass http://app_backend;
        access_log off;
    }

    location /metrics {
        proxy_pass http://app_backend;
        allow 127.0.0.1;
        deny all;
    }
}
EOF
```

## 📊 Monitoring Setup

### Step 1: Configure Prometheus

```bash
# Update Prometheus configuration for production
cat > docker/prometheus/prometheus-prod.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  - job_name: 'decrown-transport'
    static_configs:
      - targets: ['app:3000']
    metrics_path: '/metrics'
    scrape_interval: 10s

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx-exporter:9113']
EOF
```

### Step 2: Configure Alerting Rules

```bash
cat > docker/prometheus/alert_rules.yml << 'EOF'
groups:
- name: decrown-transport-alerts
  rules:
  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: High error rate detected

  - alert: DatabaseDown
    expr: up{job="postgres"} == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: Database is down

  - alert: HighMemoryUsage
    expr: nodejs_memory_usage_bytes{type="heap_used"} / nodejs_memory_usage_bytes{type="heap_total"} > 0.9
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: High memory usage detected
EOF
```

## 🔐 Security Hardening

### Step 1: Firewall Configuration

```bash
# Configure UFW firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

### Step 2: System Security

```bash
# Disable root login
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# Set up fail2ban
sudo apt install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Configure automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

## 📋 Post-Deployment Verification

### Step 1: Health Checks

```bash
# Check application health
curl -f https://yourdomain.com/health

# Check database connectivity
docker-compose exec app npm run migrate:status

# Check Redis connectivity
docker-compose exec redis redis-cli ping
```

### Step 2: Functional Testing

```bash
# Run production smoke tests
npm run test:e2e:journey

# Test payment processing (dry-run)
curl -X POST https://yourdomain.com/api/v1/payment/dry-run/enable \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

### Step 3: Performance Testing

```bash
# Install Apache Bench for load testing
sudo apt install apache2-utils

# Test API performance
ab -n 1000 -c 10 https://yourdomain.com/health

# Monitor metrics
curl https://yourdomain.com/metrics
```

## 🔄 Backup and Recovery

### Step 1: Automated Backups

```bash
# Create backup script
cat > /opt/decrown-transport/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Database backup
docker-compose exec postgres pg_dump -U decrown_user decrown_transport_prod | gzip > $BACKUP_DIR/db_backup_$DATE.sql.gz

# Redis backup
docker-compose exec redis redis-cli BGSAVE
docker cp $(docker-compose ps -q redis):/data/dump.rdb $BACKUP_DIR/redis_backup_$DATE.rdb

# Application logs backup
tar -czf $BACKUP_DIR/logs_backup_$DATE.tar.gz /opt/decrown-transport/logs/

# Cleanup old backups (keep 30 days)
find $BACKUP_DIR -name "*.gz" -mtime +30 -delete
find $BACKUP_DIR -name "*.rdb" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /opt/decrown-transport/backup.sh

# Schedule daily backups
echo "0 2 * * * /opt/decrown-transport/backup.sh" | crontab -
```

## 📈 Monitoring Dashboard

### Grafana Setup

```bash
# Access Grafana
echo "Grafana URL: http://yourdomain.com:3001"
echo "Default credentials: admin/admin"

# Import dashboard configuration
# Dashboard ID: 1860 (Node Exporter Full)
# Dashboard ID: 763 (Redis Dashboard)
# Custom DeCrown Transport Dashboard available in /docker/grafana/dashboards/
```

## 🚨 Incident Response

### Emergency Procedures

1. **System Down**: Use blue-green rollback
   ```bash
   ./scripts/deploy.sh rollback
   ```

2. **Database Issues**: Restore from backup
   ```bash
   # Stop application
   docker-compose down
   
   # Restore database
   gunzip -c /opt/backups/db_backup_YYYYMMDD_HHMMSS.sql.gz | \
   docker-compose exec -T postgres psql -U decrown_user decrown_transport_prod
   
   # Restart application
   docker-compose up -d
   ```

3. **High Load**: Scale horizontally
   ```bash
   # Add more app instances
   docker-compose up -d --scale app=3
   ```

## ✅ Production Deployment Complete

Your DeCrown Worker Transportation system is now deployed to production with:

- ✅ **High Availability**: Blue-green deployment strategy
- ✅ **Security**: SSL, firewall, and security hardening
- ✅ **Monitoring**: Prometheus, Grafana, and alerting
- ✅ **Backup**: Automated daily backups
- ✅ **Performance**: Load balancing and caching
- ✅ **Compliance**: Audit trails and data protection

## 📞 Support and Maintenance

- **Health Check**: https://yourdomain.com/health
- **Metrics**: https://yourdomain.com/metrics (internal only)
- **Grafana**: http://yourdomain.com:3001
- **Logs**: `/opt/decrown-transport/logs/`
- **Backups**: `/opt/backups/`

The system is now ready for production traffic and will automatically handle scaling, monitoring, and recovery scenarios.