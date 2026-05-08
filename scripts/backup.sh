#!/bin/bash
#
# Docker Containers Auto-Backup Script
#
# 모든 구성된 Docker 컨테이너를 백업합니다.
#
# 사용법:
#   ./backup.sh
#   ./backup.sh postgres redis
#

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PLUGIN_DIR="$( dirname "$SCRIPT_DIR" )"
BACKUP_DIR="$HOME/.docker-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 백업 디렉토리 생성
mkdir -p "$BACKUP_DIR"

echo -e "${YELLOW}🐳 Docker Containers Auto-Backup${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Backup Directory: $BACKUP_DIR"
echo "Timestamp: $TIMESTAMP"
echo ""

# PostgreSQL 백업 함수
backup_postgres() {
  local container=$1
  echo -e "${YELLOW}📦 Backing up PostgreSQL: $container${NC}"

  if ! docker exec "$container" pg_dump -U postgres -d postgres > "$BACKUP_DIR/postgres_${container}_${TIMESTAMP}.sql" 2>/dev/null; then
    echo -e "${RED}✗ Failed to backup $container${NC}"
    return 1
  fi

  local size=$(du -h "$BACKUP_DIR/postgres_${container}_${TIMESTAMP}.sql" | cut -f1)
  echo -e "${GREEN}✓ PostgreSQL backup saved (${size})${NC}"
  return 0
}

# Redis 백업 함수
backup_redis() {
  local container=$1
  echo -e "${YELLOW}📦 Backing up Redis: $container${NC}"

  if ! docker exec "$container" redis-cli BGSAVE > /dev/null 2>&1; then
    echo -e "${RED}✗ Failed to trigger BGSAVE on $container${NC}"
    return 1
  fi

  sleep 1  # RDB 파일 생성 대기

  if ! docker cp "$container:/data/dump.rdb" "$BACKUP_DIR/redis_${container}_${TIMESTAMP}.rdb" 2>/dev/null; then
    echo -e "${RED}✗ Failed to copy RDB file from $container${NC}"
    return 1
  fi

  local size=$(du -h "$BACKUP_DIR/redis_${container}_${TIMESTAMP}.rdb" | cut -f1)
  echo -e "${GREEN}✓ Redis backup saved (${size})${NC}"
  return 0
}

# 컨테이너 감지 및 백업
containers=$@
if [ -z "$containers" ]; then
  containers=$(docker ps -a --format "{{.Names}}" | xargs)
fi

success_count=0
fail_count=0

for container in $containers; do
  if docker ps -a --format "{{.Names}}" | grep -q "^${container}$"; then
    if backup_postgres "$container" 2>/dev/null; then
      ((success_count++))
    fi

    if backup_redis "$container" 2>/dev/null; then
      ((success_count++))
    fi
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓ Backup completed${NC}"
echo "Total files in backup directory:"
ls -lh "$BACKUP_DIR" | tail -n +2 | wc -l

# 오래된 백업 정리 (선택 사항: 30일 이상 된 파일)
OLD_FILES=$(find "$BACKUP_DIR" -type f -mtime +30 2>/dev/null | wc -l)
if [ "$OLD_FILES" -gt 0 ]; then
  echo -e "${YELLOW}⚠ Found $OLD_FILES backup files older than 30 days${NC}"
  echo "Run: find $BACKUP_DIR -type f -mtime +30 -delete"
fi
