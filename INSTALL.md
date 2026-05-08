# Installation & Setup Guide

## 📋 요구사항

- **Hecaton CLI** 설치됨
- **Docker Desktop** 실행 중
- **Node.js** 14.0.0 이상
- **bash** 또는 호환 셸

## 설치 단계

### 1️⃣ 플러그인 디렉토리 확인

플러그인은 이미 설치되어 있습니다:

```bash
~/.hecaton/plugins/hecaton-plugin-docker-containers/
```

### 2️⃣ 의존성 설치 (선택)

```bash
cd ~/.hecaton/plugins/hecaton-plugin-docker-containers
npm install
```

> 현재 버전은 외부 npm 의존성이 없으므로 선택 사항입니다.

### 3️⃣ Docker Desktop 확인

```bash
# Docker 설치 확인
docker --version

# Docker 데몬 실행 확인
docker ps
```

출력 예:

```
CONTAINER ID   IMAGE              COMMAND                  CREATED        STATUS
abc123         postgres:latest    "postgres"              2 hours ago    Up 2 hours
def456         redis:7-alpine     "redis-server"          2 hours ago    Up 2 hours
```

## 플러그인 실행

### UI로 실행

```bash
hecaton
```

메뉴에서 **Docker Containers** 플러그인 선택

### CLI로 실행

```bash
hecaton run docker-containers
```

## 설정

### 기본 설정 (선택 사항)

`config.example.json`을 `config.json`으로 복사하여 커스터마이징:

```bash
cd ~/.hecaton/plugins/hecaton-plugin-docker-containers
cp config.example.json config.json
```

```json
{
  "containers": {
    "postgres": {
      "name": "postgres",
      "type": "postgresql",
      "database": "postgres",
      "user": "postgres",
      "enabled": true
    },
    "redis": {
      "name": "redis",
      "type": "redis",
      "enabled": true
    }
  }
}
```

### 백업 디렉토리 설정

백업은 자동으로 저장됩니다:

```
~/.docker-backups/
```

다른 위치로 변경하려면 `docker.js` 수정:

```javascript
// docker.js 라인 7
this.backupDir = path.join(process.env.HOME || process.env.USERPROFILE, '.docker-backups');

// 변경:
this.backupDir = '/custom/backup/path';
```

## 스크립트 권한 설정

자동 백업 스크립트 실행 권한 설정:

```bash
chmod +x ~/.hecaton/plugins/hecaton-plugin-docker-containers/scripts/backup.sh
chmod +x ~/.hecaton/plugins/hecaton-plugin-docker-containers/scripts/restore.sh
```

## Cron 일정 백업 설정 (선택)

```bash
# crontab 편집
crontab -e

# 다음 라인 추가 (매일 02:00에 백업)
0 2 * * * ~/.hecaton/plugins/hecaton-plugin-docker-containers/scripts/backup.sh >> ~/.docker-backups/backup.log 2>&1
```

## 트러블슈팅

### 플러그인 로드 안 됨

```bash
# Hecaton 플러그인 디렉토리 확인
ls ~/.hecaton/plugins/hecaton-plugin-docker-containers/

# plugin.json 유효성 확인
cat ~/.hecaton/plugins/hecaton-plugin-docker-containers/plugin.json
```

### Docker 명령어 오류

```bash
# 현재 사용자가 docker 그룹에 속하는지 확인
groups $USER | grep docker

# 그룹 추가 (필요시)
sudo usermod -aG docker $USER
newgrp docker
```

### Node.js 버전 확인

```bash
node --version  # v14.0.0 이상 필요
```

구버전인 경우 업그레이드:

```bash
# macOS (Homebrew)
brew install node@18

# Windows
# https://nodejs.org/ 에서 다운로드

# Ubuntu/Debian
sudo apt update
sudo apt install nodejs
```

## 업데이트

### 플러그인 업데이트

```bash
cd ~/.hecaton/plugins/hecaton-plugin-docker-containers
git pull
```

### 백업 마이그레이션

기존 백업은 자동으로 호환됩니다:

```bash
# 기존 백업 확인
ls -lh ~/.docker-backups/
```

## 제거

플러그인 제거 (백업 유지):

```bash
rm -rf ~/.hecaton/plugins/hecaton-plugin-docker-containers
```

모든 백업도 제거 (⚠️ 주의):

```bash
rm -rf ~/.docker-backups
```

## 검증

플러그인이 올바르게 설치되었는지 확인:

```bash
# 1. 플러그인 디렉토리 확인
ls ~/.hecaton/plugins/hecaton-plugin-docker-containers/plugin.json

# 2. Docker 연결 확인
docker ps

# 3. 백업 디렉토리 확인
mkdir -p ~/.docker-backups
ls ~/.docker-backups/
```

모든 확인이 완료되면 플러그인을 실행할 준비가 되었습니다!

## 다음 단계

1. [Quick Start Guide](QUICKSTART.md) - 5분 안에 시작
2. [Usage Guide](USAGE.md) - 상세한 사용 설명
3. [Command Line Guide](COMMANDS.md) - CLI 자동화

---

**마지막 업데이트**: 2026-05-08
**버전**: 1.0.0
