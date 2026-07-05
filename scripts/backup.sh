#!/bin/sh
# Codex — резервное копирование данных content-api (Studio-правки + журнал
# событий). Единственные данные проекта, не восстановимые из git: сам код
# версионируется репозиторием, а вот services/content-api/data/ — это
# рабочее состояние production (см. .gitignore, README раздел Content API).
#
# Использование: scripts/backup.sh [каталог_бэкапов]
# По умолчанию складывает архивы в /opt/backups/codex/, храня последние 14.

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$REPO_DIR/services/content-api/data"
BACKUP_DIR="${1:-/opt/backups/codex}"
STAMP=$(date +%Y-%m-%d_%H-%M-%S)
KEEP=14

mkdir -p "$BACKUP_DIR"

if [ ! -d "$DATA_DIR" ]; then
  echo "Нет данных для бэкапа: $DATA_DIR не существует (сервис ещё ни разу не запускался)"
  exit 0
fi

tar -czf "$BACKUP_DIR/codex-data_${STAMP}.tar.gz" -C "$REPO_DIR/services/content-api" data

# ротация — оставляем последние $KEEP архивов
ls -1t "$BACKUP_DIR"/codex-data_*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "Бэкап создан: $BACKUP_DIR/codex-data_${STAMP}.tar.gz"
