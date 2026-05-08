# Docker Containers Manager - 상세 사용 가이드

## 📋 목차

1. [설치 및 초기 설정](#설치-및-초기-설정)
2. [기본 사용법](#기본-사용법)
3. [탭별 기능 설명](#탭별-기능-설명)
4. [고급 사용](#고급-사용)
5. [자동화 워크플로](#자동화-워크플로)
6. [문제 해결](#문제-해결)

## 설치 및 초기 설정

### 1단계: 플러그인 확인

플러그인이 이미 설치되어 있습니다:

```bash
~/.hecaton/plugins/hecaton-plugin-docker-containers/
```

### 2단계: Docker Desktop 실행

Docker Desktop이 실행 중인지 확인하세요:

```bash
docker ps
```

### 3단계: 플러그인 실행

Hecaton에서 Docker Containers 플러그인 선택 또는:

```bash
hecaton run docker-containers
```

## 기본 사용법

### UI 구성

```
┌─────────────────────────────────────────────────────────────────┐
│ ● Docker Containers                        ◆ Backups            │
├─────────────────────────────────────────────────────────────────┤
│ NAME             IMAGE              STATUS          PORTS        │
│ ─────────────────────────────────────────────────────────────────│
│ ▸ postgres       postgres:latest    Up 2 hours      5432         │
│   redis          redis:7-alpine     Up 2 hours      6379         │
│ ─────────────────────────────────────────────────────────────────│
│ [s] Snapshot  [r] Restore  [↑↓] Select  [TAB] Backups  [q] Quit │
└─────────────────────────────────────────────────────────────────┘
```

### 기본 네비게이션

1. **컨테이너 선택**
   ```
   ↑/↓ 키로 컨테이너 이동
   ```

2. **탭 전환**
   ```
   Tab 키로 Containers ↔ Backups 전환
   ```

3. **작업 실행**
   ```
   s: 스냅샷 생성
   r: 복원 (Backups 탭)
   d: 삭제 (Backups 탭)
   ```

## 탭별 기능 설명

### 📦 Containers 탭

현재 실행 중인 모든 Docker 컨테이너를 표시합니다.

#### 컬럼 설명

| 컬럼 | 설명 |
|------|------|
| NAME | 컨테이너 이름 |
| IMAGE | 사용 중인 이미지 |
| STATUS | 현재 상태 (Up/Exited) |
| PORTS | 매핑된 포트 |

#### 스냅샷 생성 (`s`)

1. **PostgreSQL 백업**
   ```
   1. postgres 컨테이너 선택
   2. 's' 키 눌러 스냅샷 생성
   3. 모달에서 "PostgreSQL" 선택
   4. Enter 확인
   
   결과: ~/.docker-backups/postgres_<container>_<timestamp>.sql
   ```

2. **Redis 백업**
   ```
   1. redis 컨테이너 선택
   2. 's' 키 눌러 스냅샷 생성
   3. 모달에서 "Redis" 선택
   4. Enter 확인
   
   결과: ~/.docker-backups/redis_<container>_<timestamp>.rdb
   ```

### 💾 Backups 탭

저장된 모든 백업을 관리합니다.

#### 컬럼 설명

| 컬럼 | 설명 |
|------|------|
| FILENAME | 백업 파일 이름 |
| TYPE | PostgreSQL / Redis |
| SIZE | 백업 파일 크기 |
| TIMESTAMP | 백업 생성 시간 |

#### 백업 복원 (`r`)

```
1. Backups 탭으로 이동 (Tab)
2. 복원할 백업 선택
3. 'r' 키 눌러 복원 시작
4. 자동으로 일치하는 컨테이너 탐색
5. 복원 완료 메시지 확인
```

**주의**: 복원 시 기존 데이터가 덮어씌워집니다.

#### 백업 삭제 (`d`)

```
1. Backups 탭에서 삭제할 백업 선택
2. 'd' 키 눌러 삭제 실행
3. 삭제 확인
```

## 고급 사용

### 백업 위치

모든 백업은 홈 디렉토리의 `.docker-backups` 폴더에 저장됩니다:

```
~/.docker-backups/
├── postgres_postgres_20260508_143022.sql    (2.3MB)
├── postgres_postgres_20260507_093015.sql    (2.2MB)
├── redis_redis_20260508_145500.rdb          (128KB)
└── redis_redis_20260507_100200.rdb          (127KB)
```

### 백업 파일 수동 관리

#### PostgreSQL 백업 수동 생성

```bash
# 직접 SQL 덤프 생성
docker exec postgres pg_dump -U postgres -d postgres > my_backup.sql

# 복원
docker exec -i postgres psql -U postgres -d postgres < my_backup.sql
```

#### Redis 백업 수동 생성

```bash
# RDB 파일 저장
docker exec redis redis-cli BGSAVE

# 백업 디렉토리로 복사
docker cp redis:/data/dump.rdb ~/.docker-backups/redis_manual.rdb

# 복원
docker cp ~/.docker-backups/redis_manual.rdb redis:/data/dump.rdb
docker restart redis
```

### 커스텀 설정

`config.json` (선택 사항)을 생성하여 커스텀 설정:

```json
{
  "containers": {
    "postgres": {
      "name": "my_postgres",
      "database": "mydb",
      "user": "admin"
    },
    "redis": {
      "name": "my_redis"
    }
  }
}
```

## 자동화 워크플로

### Shell 스크립트를 이용한 자동 백업

```bash
#!/bin/bash
# backup_docker.sh

docker exec postgres pg_dump -U postgres -d postgres > \
  ~/.docker-backups/postgres_$(date +%Y%m%d_%H%M%S).sql

docker exec redis redis-cli BGSAVE
docker cp redis:/data/dump.rdb \
  ~/.docker-backups/redis_$(date +%Y%m%d_%H%M%S).rdb

echo "Backup completed at $(date)"
```

실행:

```bash
chmod +x backup_docker.sh
./backup_docker.sh
```

### Cron 일정 백업

```bash
# 매일 02:00에 백업 실행
0 2 * * * ~/.hecaton/plugins/hecaton-plugin-docker-containers/backup.sh
```

### Hecaton 훅과 통합

`.hecaton/settings.json`에 추가:

```json
{
  "hooks": {
    "before_exit": "~/.hecaton/plugins/hecaton-plugin-docker-containers/backup.sh"
  }
}
```

## 문제 해결

### Q: "No containers found" 메시지

**A:** Docker Desktop이 실행 중인지 확인하세요:

```bash
# Docker 서비스 확인
docker ps

# Docker Desktop 재시작
# macOS/Windows: Docker Desktop 앱 재시작
```

### Q: 스냅샷 생성 중 timeout

**A:** 데이터베이스가 크면 시간이 걸릴 수 있습니다.

```bash
# 수동으로 백그라운드 실행
docker exec postgres pg_dump -U postgres -d postgres > backup.sql &
```

### Q: 복원 후 컨테이너가 응답 안 함

**A:** 컨테이너 로그 확인:

```bash
docker logs postgres
docker logs redis
```

### Q: 백업 파일이 너무 크다

**A:** 자동 정리 설정 또는 수동 삭제:

```bash
# 1주일 이상 된 백업 삭제
find ~/.docker-backups -name "*.sql" -o -name "*.rdb" | \
  xargs -I {} sh -c 'find {} -mtime +7 -delete'
```

### Q: Permission denied 에러

**A:** Docker 권한 확인:

```bash
# 현재 사용자를 docker 그룹에 추가
sudo usermod -aG docker $USER
newgrp docker

# 또는 sudo 사용
sudo docker ps
```

## 팁 & 트릭

### 💡 백업 이름 규칙

플러그인이 자동으로 생성하는 백업명:

```
postgres_<container_name>_<YYYYMMDDhhmmss>.sql
redis_<container_name>_<YYYYMMDDhhmmss>.rdb
```

### 💡 빠른 백업 비교

두 백업을 비교하려면:

```bash
# PostgreSQL: 스키마만 비교
diff <(pg_dump -s) <(pg_dump -s < backup.sql)

# Redis: 크기 비교
ls -lh ~/.docker-backups/redis_*.rdb | sort -k5 -h
```

### 💡 인증 정보 변경

PostgreSQL 암호 변경 후 수동 백업:

```bash
# 암호 입력 프롬프트 표시
PGPASSWORD=<password> docker exec postgres pg_dump -U postgres -d postgres
```

## 지원되는 데이터베이스

현재:
- ✅ PostgreSQL
- ✅ Redis

향후:
- MySQL/MariaDB
- MongoDB
- DynamoDB

---

**마지막 업데이트**: 2026-05-08
**버전**: 1.0.0
