#!/bin/sh
# Monthly package-cache cleanup for this shared VPS.
#
# Deletes ONLY re-downloadable package-manager caches. It deliberately does
# not touch logs, browser caches, ML model caches (huggingface) or tool
# binaries (playwright, prisma) — those are either needed or slow to rebuild.
#
# Installed as /etc/cron.monthly/clean-package-caches. Remove that file to stop it.
set -u
for home in /root /home/user /home/openclaw /home/dev; do
    [ -d "$home" ] || continue
    for dir in .npm/_cacache .npm/_npx .cache/pip .cache/uv; do
        target="$home/$dir"
        [ -d "$target" ] && rm -rf -- "$target"
    done
done
exit 0
