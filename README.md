# Docker Containers Manager Plugin for Hecaton

Hecaton 플러그인으로 Docker 컨테이너의 스냅샷 및 복원 기능을 관리합니다.

## ✨ 기능

### 🐳 컨테이너 관리
- **컨테이너 목록** - 실행 중인/중지된 모든 Docker 컨테이너 표시
- **스냅샷 생성** - PostgreSQL과 Redis 데이터베이스 백업
  - PostgreSQL: `pg_dump`로 SQL 덤프 저장
  - Redis: RDB 파일 백업

### 💾 백업 관리
- **백업 목록** - 저장된 모든 백업 확인
- **데이터 복원** - 백업에서 컨테이너로 데이터 복원
- **백업 삭제** - 불필요한 백업 제거

## 📋 요구사항

- **Hecaton CLI** 설치됨
- **Docker Desktop** 실행 중
- PostgreSQL 컨테이너 (선택적)
- Redis 컨테이너 (선택적)

## 🚀 사용법

### 플러그인 실행

Hecaton에서 Docker Containers 플러그인 선택:

```bash
hecaton run docker-containers
```

### 키보드 단축키

| 키 | 기능 |
|----|------|
| `↑`/`↓` | 컨테이너/백업 선택 |
| `Tab` | 탭 전환 (Containers ↔ Backups) |
| `s` | 스냅샷 생성 (Containers 탭) |
| `r` | 백업 복원 (Backups 탭) |
| `d` | 백업 삭제 (Backups 탭) |
| `Enter` | 작업 확인 |
| `Esc` | 모달 닫기 / 종료 |
| `q` | 플러그인 종료 |

## 💾 백업 저장 위치

백업은 다음 위치에 자동 저장됩니다:

```
~/.docker-backups/
├── postgres_<container>_<timestamp>.sql
└── redis_<container>_<timestamp>.rdb
```

## 📚 문서

- [Quick Start](QUICKSTART.md) - 5분 안에 시작하기
- [설치 & 설정](INSTALL.md) - 설치 및 설정 방법
- [상세 사용 가이드](USAGE.md) - 모든 기능 상세 설명
- [Command Line 가이드](COMMANDS.md) - CLI 자동화 방법

## 🏗️ 기술 스택

- **Hecaton API** - UI 렌더링 및 이벤트
- **Docker CLI** - 컨테이너 관리
- **JavaScript** - 플러그인 로직

## 📁 플러그인 구조

```
hecaton-plugin-docker-containers/
├── plugin.json              # 플러그인 메타데이터
├── main.js                  # 메인 진입점
├── docker.js                # Docker CLI 래핑
├── render.js                # UI 렌더링
├── state.js                 # 상태 관리
├── config.example.json      # 설정 템플릿
├── scripts/
│   ├── backup.sh            # 자동 백업 스크립트
│   └── restore.sh           # 복원 스크립트
└── docs/
    ├── QUICKSTART.md
    ├── INSTALL.md
    ├── USAGE.md
    └── COMMANDS.md
```

## ⚠️ 주의사항

### 복원 시 데이터 덮어씌워짐
- 복원 시 기존 데이터가 **완전히 덮어씌워집니다**
- 복원 전에 현재 데이터 백업을 강력히 권장합니다

### 디스크 용량 관리
- 대량의 백업 파일이 누적될 수 있습니다
- 오래된 백업은 주기적으로 정리하세요

### PostgreSQL/Redis 필수
- PostgreSQL 컨테이너가 실행 중이어야 pg_dump 가능
- Redis 컨테이너가 실행 중이어야 BGSAVE 가능

## 🔧 문제 해결

### Docker 명령어 실행 오류

```bash
# Docker Desktop이 실행 중인지 확인
docker ps

# 현재 사용자가 docker 그룹에 속하는지 확인
groups $USER | grep docker
```

### 백업 파일을 찾을 수 없음

```bash
# 백업 디렉토리 확인
ls ~/.docker-backups/
```

### 컨테이너가 표시되지 않음

```bash
# 전체 컨테이너 확인
docker ps -a
```

## 💡 팁

### 자동 정기 백업
Cron을 이용한 자동 백업 설정:

```bash
crontab -e
# 0 2 * * * ~/.hecaton/plugins/hecaton-plugin-docker-containers/scripts/backup.sh
```

### 백업 파일 압축
PostgreSQL 백업 파일을 압축하여 저장 공간 절약:

```bash
docker exec postgres pg_dump -U postgres -d postgres | gzip > backup.sql.gz
```

## 🤝 기여

개선 사항이나 버그 리포트는 환영합니다!

## 📄 라이센스

MIT

---

**마지막 업데이트**: 2026-05-08  
**버전**: 1.0.0  
**상태**: ✅ Hecaton API 호환
