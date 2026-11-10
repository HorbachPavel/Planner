#!/bin/bash
# Open FocusFlow, starting the login server first when it is not already up.
set -euo pipefail

URL="http://127.0.0.1:3000"
LABEL="com.focusflow.server"
DOMAIN="gui/$(id -u)"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG="${HOME}/Library/Logs/FocusFlow/server.log"

mkdir -p "${HOME}/Library/Logs/FocusFlow"

if ! curl -fsS -o /dev/null --max-time 2 "$URL"; then
  if [[ ! -f "$PLIST" ]]; then
    osascript -e "display alert \"FocusFlow is not installed\" message \"The login service is missing. Run scripts/macos/install-launcher.sh from the project.\"" >/dev/null 2>&1 || true
    exit 1
  fi
  launchctl bootstrap "$DOMAIN" "$PLIST" >/dev/null 2>&1 \
    || launchctl kickstart "$DOMAIN/$LABEL" >/dev/null 2>&1 \
    || true

  ready=0
  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null --max-time 1 "$URL"; then
      ready=1
      break
    fi
    sleep 0.5
  done
  if [[ "$ready" -ne 1 ]]; then
    osascript -e "display alert \"FocusFlow did not start\" message \"Details are in ${LOG}\"" >/dev/null 2>&1 || true
    exit 1
  fi
fi

open "$URL"
