# Command Line Usage Guide

Hecaton 플러그인 UI 대신 command line에서 직접 Docker 백업/복원을 수행할 수 있습니다.

## 제공 스크립트

### 1. 자동 백업 스크립트

```bash
./scripts/backup.sh
```

**기능:**
- 모든 Docker 컨테이너 자동 감지
- PostgreSQL: `pg_dump`로 SQL 백업
- Redis: RDB 파일 백업
- 타임스탬프 자동 추가

**예제:**

```bash
# 모든 컨테이너 백업
./scripts/backup.sh

# 특정 컨테이너만 백업
./scripts/backup.sh postgres redis
```

**출력:**

```
🐳 Docker Containers Auto-Backup
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Backup Directory: /home/user/.docker-backups
Timestamp: 20260508_143022

📦 Backing up PostgreSQL: postgres
✓ PostgreSQL backup saved (2.3M)
📦 Backing up Redis: redis
✓ Redis backup saved (256K)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Backup completed
```

### 2. 복원 스크립트

```bash
./scripts/restore.sh <backup_file> [container_name]
```

**파라미터:**
- `<backup_file>` - 복원할 백업 파일 경로 (필수)
- `[container_name]` - 대상 컨테이너 이름 (선택, 자동 감지됨)

**예제:**

```bash
# PostgreSQL 복원 (컨테이너 자동 감지)
./scripts/restore.sh ~/.docker-backups/postgres_postgres_20260508_143022.sql

# PostgreSQL 복원 (명시적 지정)
./scripts/restore.sh ~/.docker-backups/postgres_postgres_20260508_143022.sql postgres

# Redis 복원
./scripts/restore.sh ~/.docker-backups/redis_redis_20260508_143022.rdb redis
```

**안내:**

```
🔄 Docker Containers Restore
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Backup File: /home/user/.docker-backups/postgres_postgres_20260508_143022.sql
File Size: 2.3M
Type: postgresql

Target Container: postgres
Container Status: running

⚠️  WARNING: This will overwrite existing data in postgres
Continue with restore? (yes/no): yes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 Restoring PostgreSQL...
✓ PostgreSQL restore completed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Restore completed successfully
```

## Docker CLI 직접 사용

### PostgreSQL

#### 백업

```bash
# 기본 백업
docker exec postgres pg_dump -U postgres -d postgres > backup.sql

# 압축된 백업
docker exec postgres pg_dump -U postgres -d postgres | gzip > backup.sql.gz

# 특정 테이블만 백업
docker exec postgres pg_dump -U postgres -d postgres -t table_name > table_backup.sql

# 스키마만 백업 (-s 옵션)
docker exec postgres pg_dump -U postgres -d postgres -s > schema.sql
```

#### 복원

```bash
# 기본 복원
docker exec -i postgres psql -U postgres -d postgres < backup.sql

# 압축된 백업 복원
docker exec -i postgres psql -U postgres -d postgres < <(gunzip -c backup.sql.gz)

# 다른 데이터베이스로 복원
docker exec -i postgres psql -U postgres -d other_db < backup.sql

# 복원 전 데이터베이스 재생성
docker exec postgres dropdb -U postgres -i --if-exists postgres
docker exec postgres createdb -U postgres postgres
docker exec -i postgres psql -U postgres -d postgres < backup.sql
```

### Redis

#### 백업

```bash
# RDB 파일 백업 (BGSAVE)
docker exec redis redis-cli BGSAVE
docker cp redis:/data/dump.rdb ./redis_backup.rdb

# 또는 SAVE (동기)
docker exec redis redis-cli SAVE
docker cp redis:/data/dump.rdb ./redis_backup.rdb

# AOF 백업
docker cp redis:/data/appendonly.aof ./redis_aof_backup.aof
```

#### 복원

```bash
# RDB 파일로 복원
docker cp ./redis_backup.rdb redis:/data/dump.rdb
docker restart redis

# 또는 redis-cli로 복원
docker exec redis redis-cli SHUTDOWN
docker cp ./redis_backup.rdb redis:/data/dump.rdb
docker start redis
```

## 자동화 워크플로

### Cron으로 일정 백업

```bash
# 시스템 crontab 편집
crontab -e

# 다음 라인 추가:
# 매일 02:00에 백업 실행
0 2 * * * /home/user/.hecaton/plugins/hecaton-plugin-docker-containers/scripts/backup.sh

# 매주 일요일 03:00에 백업 실행
0 3 * * 0 /home/user/.hecaton/plugins/hecaton-plugin-docker-containers/scripts/backup.sh
```

### Systemd 타이머 (선택)

```bash
# /etc/systemd/system/docker-backup.service
[Unit]
Description=Docker Container Backup
After=docker.service

[Service]
Type=oneshot
ExecStart=/home/user/.hecaton/plugins/hecaton-plugin-docker-containers/scripts/backup.sh
User=user

---

# /etc/systemd/system/docker-backup.timer
[Unit]
Description=Run Docker Container Backup Daily
Requires=docker-backup.service

[Timer]
OnCalendar=daily
OnCalendar=*-*-* 02:00:00

[Install]
WantedBy=timers.target

# 활성화
sudo systemctl daemon-reload
sudo systemctl enable docker-backup.timer
sudo systemctl start docker-backup.timer
```

### 수동 백업 & 복원 한번에

```bash
#!/bin/bash
# full-backup-restore.sh

BACKUP_DIR="$HOME/.docker-backups"
mkdir -p "$BACKUP_DIR"

# 백업
docker exec postgres pg_dump -U postgres -d postgres | \
  gzip > "$BACKUP_DIR/postgres_full_$(date +%Y%m%d_%H%M%S).sql.gz"

docker exec redis redis-cli BGSAVE
docker cp redis:/data/dump.rdb \
  "$BACKUP_DIR/redis_full_$(date +%Y%m%d_%H%M%S).rdb"

echo "✓ Backup completed"
echo "Files: $(ls -lh $BACKUP_DIR | tail -n 2)"
```

## 고급 옵션

### PostgreSQL 고급 백업

```bash
# 병렬 백업 (빠름)
docker exec postgres pg_dump -U postgres -d postgres \
  --format=directory --jobs=4 -f backup_dir

# 커스텀 포맷 (복원 유연성)
docker exec postgres pg_dump -U postgres -d postgres \
  --format=custom -f backup.dump

# 커스텀 복원
docker exec -i postgres pg_restore -U postgres -d postgres backup.dump
```

### Redis 고급 백업

```bash
# Redis 정보 조회
docker exec redis redis-cli info

# 메모리 사용 현황
docker exec redis redis-cli info memory

# 백업 파일 정보
docker exec redis redis-cli LASTSAVE

# 백업 일시적으로 비활성화
docker exec redis redis-cli CONFIG SET save ""
```

## 문제 해결

### 권한 문제

```bash
# 현재 사용자를 docker 그룹에 추가
sudo usermod -aG docker $USER
newgrp docker

# 또는 스크립트를 sudo로 실행
sudo ./scripts/backup.sh
```

### 용량 부족

```bash
# 백업 디렉토리 크기 확인
du -sh ~/.docker-backups

# 오래된 백업 자동 삭제 (30일 이상)
find ~/.docker-backups -type f -mtime +30 -delete

# 특정 패턴 삭제
rm ~/.docker-backups/postgres_*.sql
```

### 컨테이너 연결 오류

```bash
# 컨테이너 상태 확인
docker ps -a | grep postgres
docker ps -a | grep redis

# 컨테이너 로그 확인
docker logs postgres
docker logs redis

# 컨테이너 재시작
docker restart postgres redis
```

## 모니터링

### 백업 용량 추적

```bash
#!/bin/bash
# backup_usage.sh

BACKUP_DIR="$HOME/.docker-backups"

echo "Backup Directory Size: $(du -sh $BACKUP_DIR | cut -f1)"
echo ""
echo "File Count by Type:"
echo "  PostgreSQL: $(ls $BACKUP_DIR/postgres_*.sql 2>/dev/null | wc -l) files"
echo "  Redis: $(ls $BACKUP_DIR/redis_*.rdb 2>/dev/null | wc -l) files"
echo ""
echo "Recent Backups:"
ls -lht $BACKUP_DIR | head -5
```

실행:

```bash
chmod +x backup_usage.sh
./backup_usage.sh
```

---

**마지막 업데이트**: 2026-05-08
**버전**: 1.0.0
