#!/bin/bash
#
# Docker Containers Restore Script
#
# 백업에서 Docker 컨테이너로 데이터를 복원합니다.
#
# 사용법:
#   ./restore.sh <backup_file> [container_name]
#   ./restore.sh ~/.docker-backups/postgres_postgres_20260508_143022.sql postgres
#   ./restore.sh ~/.docker-backups/redis_redis_20260508_143022.rdb redis
#

set -e

if [ -z "$1" ]; then
  echo "Usage: restore.sh <backup_file> [container_name]"
  exit 1
fi

BACKUP_FILE="$1"
CONTAINER_NAME="${2}"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 백업 파일 검증
if [ ! -f "$BACKUP_FILE" ]; then
  echo -e "${RED}✗ Backup file not found: $BACKUP_FILE${NC}"
  exit 1
fi

# 파일 타입 판단
if [[ "$BACKUP_FILE" == *.sql ]]; then
  BACKUP_TYPE="postgresql"
elif [[ "$BACKUP_FILE" == *.rdb ]]; then
  BACKUP_TYPE="redis"
else
  echo -e "${RED}✗ Unknown backup file type${NC}"
  exit 1
fi

echo -e "${YELLOW}🔄 Docker Containers Restore${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Backup File: ${BLUE}$BACKUP_FILE${NC}"
echo "File Size: $(du -h "$BACKUP_FILE" | cut -f1)"
echo "Type: $BACKUP_TYPE"
echo ""

# 컨테이너 자동 감지 (지정하지 않은 경우)
if [ -z "$CONTAINER_NAME" ]; then
  if [ "$BACKUP_TYPE" = "postgresql" ]; then
    CONTAINER_NAME=$(docker ps -a --format "{{.Names}}" | grep -E "(postgres|pg)" | head -1 || echo "")
  else
    CONTAINER_NAME=$(docker ps -a --format "{{.Names}}" | grep -E "redis" | head -1 || echo "")
  fi

  if [ -z "$CONTAINER_NAME" ]; then
    echo -e "${RED}✗ Could not auto-detect container${NC}"
    echo "Please provide container name as second argument"
    exit 1
  fi
fi

# 컨테이너 존재 확인
if ! docker ps -a --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
  echo -e "${RED}✗ Container not found: $CONTAINER_NAME${NC}"
  exit 1
fi

echo -e "Target Container: ${BLUE}$CONTAINER_NAME${NC}"
echo ""

# 컨테이너 상태 확인
CONTAINER_STATUS=$(docker inspect "$CONTAINER_NAME" --format='{{.State.Status}}')
echo -e "Container Status: ${YELLOW}$CONTAINER_STATUS${NC}"

if [ "$CONTAINER_STATUS" != "running" ]; then
  echo -e "${YELLOW}⚠ Starting container: $CONTAINER_NAME${NC}"
  docker start "$CONTAINER_NAME"
  sleep 3
fi

# 복원 전 경고
echo ""
echo -e "${RED}⚠️  WARNING: This will ${YELLOW}overwrite existing data${RED} in ${YELLOW}$CONTAINER_NAME${NC}"
read -p "Continue with restore? (yes/no): " -r CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo -e "${YELLOW}Restore cancelled${NC}"
  exit 0
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# PostgreSQL 복원
if [ "$BACKUP_TYPE" = "postgresql" ]; then
  echo -e "${YELLOW}🔄 Restoring PostgreSQL...${NC}"

  if docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres < "$BACKUP_FILE" 2>/dev/null; then
    echo -e "${GREEN}✓ PostgreSQL restore completed${NC}"
  else
    echo -e "${RED}✗ PostgreSQL restore failed${NC}"
    exit 1
  fi

# Redis 복원
elif [ "$BACKUP_TYPE" = "redis" ]; then
  echo -e "${YELLOW}🔄 Restoring Redis...${NC}"

  # RDB 파일 복사
  if docker cp "$BACKUP_FILE" "$CONTAINER_NAME:/data/dump.rdb"; then
    echo -e "${YELLOW}✓ RDB file copied${NC}"

    # Redis 재시작
    echo -e "${YELLOW}Restarting container...${NC}"
    docker restart "$CONTAINER_NAME"
    sleep 3

    echo -e "${GREEN}✓ Redis restore completed${NC}"
  else
    echo -e "${RED}✗ Redis restore failed${NC}"
    exit 1
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓ Restore completed successfully${NC}"
echo ""
echo "Next steps:"
echo "  1. Verify data: docker exec $CONTAINER_NAME [appropriate command]"
echo "  2. Check logs: docker logs $CONTAINER_NAME"
echo "  3. Test connection: docker exec $CONTAINER_NAME [test command]"
