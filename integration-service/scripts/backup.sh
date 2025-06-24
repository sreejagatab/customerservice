#!/bin/bash

# Integration Service Backup Script
# This script creates backups of the database and important data

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Default values
BACKUP_DIR="./backups"
ENVIRONMENT="production"
KEEP_DAYS=30
COMPRESS=true

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -d, --backup-dir DIR     Backup directory [default: ./backups]"
    echo "  -e, --environment ENV    Environment (development|staging|production) [default: production]"
    echo "  -k, --keep-days DAYS     Number of days to keep backups [default: 30]"
    echo "  -n, --no-compress        Don't compress backup files"
    echo "  -h, --help               Show this help message"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--backup-dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -k|--keep-days)
            KEEP_DAYS="$2"
            shift 2
            ;;
        -n|--no-compress)
            COMPRESS=false
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="integration_service_${ENVIRONMENT}_${TIMESTAMP}"

print_status "Starting backup for environment: $ENVIRONMENT"
print_status "Backup directory: $BACKUP_DIR"
print_status "Backup name: $BACKUP_NAME"

# Load environment variables
ENV_FILE=".env"
if [[ "$ENVIRONMENT" != "production" ]]; then
    ENV_FILE=".env.$ENVIRONMENT"
fi

if [[ -f "$ENV_FILE" ]]; then
    print_status "Loading environment variables from $ENV_FILE"
    set -a
    source "$ENV_FILE"
    set +a
else
    print_error "Environment file $ENV_FILE not found"
    exit 1
fi

# Extract database connection details
if [[ -z "$DATABASE_URL" ]]; then
    print_error "DATABASE_URL not found in environment"
    exit 1
fi

# Parse DATABASE_URL
DB_URL_REGEX="postgresql://([^:]+):([^@]+)@([^:]+):([0-9]+)/(.+)"
if [[ $DATABASE_URL =~ $DB_URL_REGEX ]]; then
    DB_USER="${BASH_REMATCH[1]}"
    DB_PASS="${BASH_REMATCH[2]}"
    DB_HOST="${BASH_REMATCH[3]}"
    DB_PORT="${BASH_REMATCH[4]}"
    DB_NAME="${BASH_REMATCH[5]}"
else
    print_error "Invalid DATABASE_URL format"
    exit 1
fi

print_status "Database: $DB_NAME on $DB_HOST:$DB_PORT"

# Create database backup
print_status "Creating database backup..."
DB_BACKUP_FILE="$BACKUP_DIR/${BACKUP_NAME}_database.sql"

export PGPASSWORD="$DB_PASS"
if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" > "$DB_BACKUP_FILE"; then
    print_success "Database backup created: $DB_BACKUP_FILE"
else
    print_error "Database backup failed"
    exit 1
fi

# Create Redis backup if Redis is available
if [[ -n "$REDIS_URL" ]]; then
    print_status "Creating Redis backup..."
    
    # Parse Redis URL
    REDIS_URL_REGEX="redis://([^:]*):?([^@]*)@?([^:]+):([0-9]+)/?([0-9]*)"
    if [[ $REDIS_URL =~ $REDIS_URL_REGEX ]]; then
        REDIS_HOST="${BASH_REMATCH[3]}"
        REDIS_PORT="${BASH_REMATCH[4]}"
        REDIS_DB="${BASH_REMATCH[5]:-0}"
        
        REDIS_BACKUP_FILE="$BACKUP_DIR/${BACKUP_NAME}_redis.rdb"
        
        if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --rdb "$REDIS_BACKUP_FILE" > /dev/null 2>&1; then
            print_success "Redis backup created: $REDIS_BACKUP_FILE"
        else
            print_warning "Redis backup failed (Redis might not be available)"
        fi
    fi
fi

# Backup configuration files
print_status "Backing up configuration files..."
CONFIG_BACKUP_DIR="$BACKUP_DIR/${BACKUP_NAME}_config"
mkdir -p "$CONFIG_BACKUP_DIR"

# Copy important configuration files
cp .env* "$CONFIG_BACKUP_DIR/" 2>/dev/null || true
cp package.json "$CONFIG_BACKUP_DIR/" 2>/dev/null || true
cp package-lock.json "$CONFIG_BACKUP_DIR/" 2>/dev/null || true
cp docker-compose*.yml "$CONFIG_BACKUP_DIR/" 2>/dev/null || true
cp Dockerfile* "$CONFIG_BACKUP_DIR/" 2>/dev/null || true
cp nginx.conf "$CONFIG_BACKUP_DIR/" 2>/dev/null || true

print_success "Configuration files backed up to: $CONFIG_BACKUP_DIR"

# Backup logs if they exist
if [[ -d "logs" ]]; then
    print_status "Backing up logs..."
    LOGS_BACKUP_DIR="$BACKUP_DIR/${BACKUP_NAME}_logs"
    cp -r logs "$LOGS_BACKUP_DIR"
    print_success "Logs backed up to: $LOGS_BACKUP_DIR"
fi

# Compress backups if requested
if [[ "$COMPRESS" == true ]]; then
    print_status "Compressing backup files..."
    
    ARCHIVE_FILE="$BACKUP_DIR/${BACKUP_NAME}.tar.gz"
    
    cd "$BACKUP_DIR"
    tar -czf "${BACKUP_NAME}.tar.gz" \
        "${BACKUP_NAME}_database.sql" \
        "${BACKUP_NAME}_config" \
        $([ -f "${BACKUP_NAME}_redis.rdb" ] && echo "${BACKUP_NAME}_redis.rdb") \
        $([ -d "${BACKUP_NAME}_logs" ] && echo "${BACKUP_NAME}_logs")
    
    # Remove individual files after compression
    rm -f "${BACKUP_NAME}_database.sql"
    rm -f "${BACKUP_NAME}_redis.rdb" 2>/dev/null || true
    rm -rf "${BACKUP_NAME}_config"
    rm -rf "${BACKUP_NAME}_logs" 2>/dev/null || true
    
    cd - > /dev/null
    
    print_success "Backup compressed to: $ARCHIVE_FILE"
    
    # Calculate backup size
    BACKUP_SIZE=$(du -h "$ARCHIVE_FILE" | cut -f1)
    print_status "Backup size: $BACKUP_SIZE"
fi

# Clean up old backups
if [[ $KEEP_DAYS -gt 0 ]]; then
    print_status "Cleaning up backups older than $KEEP_DAYS days..."
    
    find "$BACKUP_DIR" -name "integration_service_${ENVIRONMENT}_*" -type f -mtime +$KEEP_DAYS -delete
    
    print_success "Old backups cleaned up"
fi

# Create backup manifest
MANIFEST_FILE="$BACKUP_DIR/backup_manifest.txt"
echo "$(date): $BACKUP_NAME" >> "$MANIFEST_FILE"

print_success "Backup completed successfully!"
print_status "Backup location: $BACKUP_DIR"

# Show backup summary
print_status "Backup Summary:"
if [[ "$COMPRESS" == true ]]; then
    ls -lh "$BACKUP_DIR"/${BACKUP_NAME}.tar.gz
else
    ls -lh "$BACKUP_DIR"/${BACKUP_NAME}_*
fi
