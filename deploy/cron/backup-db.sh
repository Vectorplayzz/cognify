#!/bin/sh
# Daily Cognify database backup. Keeps the newest 14 dumps.
# Credentials are read from the app's .env, never stored here.
# Installed as /etc/cron.daily/cognify-db-backup. Remove that file to stop it.
set -eu
ENV_FILE=/var/www/cognify/.env
DEST=/root/cognify-backups
KEEP=14

umask 077
mkdir -p "$DEST"
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

out="$DEST/cognify-$(date +%Y%m%d-%H%M%S).sql.gz"
if MYSQL_PWD="$DB_PASSWORD" mysqldump -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" \
        --single-transaction --no-tablespaces "$DB_NAME" | gzip > "$out.tmp"; then
    mv "$out.tmp" "$out"
else
    rm -f "$out.tmp"
    echo "cognify-db-backup: mysqldump failed" >&2
    exit 1
fi

# Prune only this script's own dumps, oldest first.
ls -1t "$DEST"/cognify-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do rm -f -- "$old"; done
