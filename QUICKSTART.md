# Quick Start Guide

5분 안에 Docker 컨테이너 백업/복원을 시작하세요.

## 1️⃣ 플러그인 실행

Hecaton에서 Docker Containers 플러그인 선택:

```
Main Menu → Plugins → Docker Containers
```

또는 터미널:

```bash
hecaton run docker-containers
```

## 2️⃣ 컨테이너 확인

Containers 탭에서 실행 중인 Docker 컨테이너 확인:

```
● Docker Containers
────────────────────────────────────────
NAME             IMAGE              STATUS
────────────────────────────────────────
▸ postgres       postgres:latest    Up 2 hours
  redis          redis:7-alpine     Up 2 hours
```

## 3️⃣ 백업 생성

### PostgreSQL 백업

```
1. 'postgres' 컨테이너 선택 (↑/↓)
2. 's' 키 눌러 스냅샷 시작
3. 모달에서 "PostgreSQL" 선택
4. Enter 확인

✓ Snapshot saved: postgres_postgres_20260508_143022.sql
```

### Redis 백업

```
1. 'redis' 컨테이너 선택 (↑/↓)
2. 's' 키 눌러 스냅샷 시작
3. 모달에서 "Redis" 선택
4. Enter 확인

✓ Snapshot saved: redis_redis_20260508_143022.rdb
```

## 4️⃣ 백업 확인

Tab 키로 Backups 탭으로 이동:

```
◆ Backups
────────────────────────────────────────────────
FILENAME                              TYPE        SIZE       TIMESTAMP
────────────────────────────────────────────────
postgres_postgres_20260508_143022.sql PostgreSQL  2.3MB      2026-05-08 14:30:22
redis_redis_20260508_143022.rdb       Redis       256KB      2026-05-08 14:30:22
```

## 5️⃣ 데이터 복원

Backups 탭에서:

```
1. 복원할 백업 선택 (↑/↓)
2. 'r' 키 눌러 복원 시작
3. 대기하며 복원 완료 확인

✓ Restored from postgres_postgres_20260508_143022.sql
```

---

## ⚡ Command Line 빠른 사용

### 자동 백업

```bash
~/.hecaton/plugins/hecaton-plugin-docker-containers/scripts/backup.sh
```

### 백업 복원

```bash
~/.hecaton/plugins/hecaton-plugin-docker-containers/scripts/restore.sh \
  ~/.docker-backups/postgres_postgres_20260508_143022.sql
```

---

## 📍 백업 저장 위치

```
~/.docker-backups/
```

---

## 🔑 기본 단축키

| 키 | 동작 |
|----|------|
| ↑/↓ | 항목 선택 |
| Tab | 탭 전환 |
| s | 스냅샷 |
| r | 복원 |
| d | 삭제 |
| q | 종료 |

---

## ⚠️ 주의사항

1. **복원 시 데이터 덮어씌워짐** - 복원 전에 현재 데이터 백업
2. **Docker Desktop 실행** - 플러그인 사용 전 필수
3. **디스크 용량** - 대량의 백업 파일이 누적될 수 있음

---

## 📚 더 알아보기

- [상세 사용 가이드](USAGE.md)
- [Command Line 사용법](COMMANDS.md)
- [README](README.md)

---

**🎉 끝!** 이제 Docker 컨테이너를 안전하게 백업할 수 있습니다.
