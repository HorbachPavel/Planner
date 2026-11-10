#!/bin/bash
# Install the FocusFlow Dock icon and the login service that starts the server.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="${HOME}/Applications/FocusFlow.app"
LABEL="com.focusflow.server"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
DOMAIN="gui/$(id -u)"
LOG_DIR="${HOME}/Library/Logs/FocusFlow"
ICONSET="$(mktemp -d)/FocusFlow.iconset"

mkdir -p "$LOG_DIR" "${HOME}/Applications" "${HOME}/Library/LaunchAgents"

python3 "$ROOT/scripts/macos/make-icon.py" "$ICONSET-master.png"
mkdir -p "$ICONSET"
sips -z 16 16 "$ICONSET-master.png" --out "$ICONSET/icon_16x16.png" >/dev/null
sips -z 32 32 "$ICONSET-master.png" --out "$ICONSET/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$ICONSET-master.png" --out "$ICONSET/icon_32x32.png" >/dev/null
sips -z 64 64 "$ICONSET-master.png" --out "$ICONSET/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$ICONSET-master.png" --out "$ICONSET/icon_128x128.png" >/dev/null
sips -z 256 256 "$ICONSET-master.png" --out "$ICONSET/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$ICONSET-master.png" --out "$ICONSET/icon_256x256.png" >/dev/null
sips -z 512 512 "$ICONSET-master.png" --out "$ICONSET/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$ICONSET-master.png" --out "$ICONSET/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$ICONSET-master.png" --out "$ICONSET/icon_512x512@2x.png" >/dev/null
iconutil -c icns "$ICONSET" -o "$ICONSET.icns"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$ICONSET.icns" "$APP/Contents/Resources/AppIcon.icns"
cp "$ROOT/scripts/macos/open.sh" "$APP/Contents/MacOS/FocusFlow"
chmod +x "$APP/Contents/MacOS/FocusFlow" "$ROOT/scripts/macos/serve.sh" "$ROOT/scripts/macos/open.sh"

cat > "$APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>FocusFlow</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>com.focusflow.launcher</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>FocusFlow</string>
  <key>CFBundleDisplayName</key>
  <string>FocusFlow</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

codesign --force --sign - --identifier com.focusflow.launcher "$APP"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${ROOT}/scripts/macos/serve.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/server.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/server.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>${HOME}</string>
  </dict>
</dict>
</plist>
EOF

# Hand the port to launchd when this project is already serving it.
LISTENER_PID="$(lsof -nP -iTCP:3000 -sTCP:LISTEN -t 2>/dev/null | head -n 1 || true)"
if [[ -n "${LISTENER_PID}" ]]; then
  LISTENER_CWD="$(lsof -a -p "$LISTENER_PID" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1 || true)"
  if [[ "$LISTENER_CWD" == "$ROOT" ]]; then
    PARENT_PID="$(ps -p "$LISTENER_PID" -o ppid= 2>/dev/null | tr -d ' ' || true)"
    PARENT_CMD="$(ps -p "${PARENT_PID:-0}" -o args= 2>/dev/null || true)"
    if [[ "$PARENT_CMD" == *"npm"* ]]; then
      kill "$PARENT_PID" 2>/dev/null || true
    else
      kill "$LISTENER_PID" 2>/dev/null || true
    fi
    for _ in $(seq 1 20); do
      if ! lsof -nP -iTCP:3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
        break
      fi
      sleep 0.25
    done
    if lsof -nP -iTCP:3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
      kill -9 "$LISTENER_PID" "${PARENT_PID:-}" 2>/dev/null || true
      sleep 0.5
    fi
  fi
fi

launchctl bootout "$DOMAIN" "$PLIST" >/dev/null 2>&1 || true
if lsof -nP -iTCP:3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "Port 3000 is still in use. The login service is installed and will start at the next login."
else
  launchctl bootstrap "$DOMAIN" "$PLIST"
  ready=0
  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null --max-time 1 "http://127.0.0.1:3000" 2>/dev/null; then
      ready=1
      break
    fi
    sleep 0.5
  done
  if [[ "$ready" -ne 1 ]]; then
    echo "FocusFlow did not answer on port 3000. See ${LOG_DIR}/server.log" >&2
    exit 1
  fi
fi

if dockutil --find "FocusFlow" >/dev/null 2>&1; then
  dockutil --add "$APP" --label "FocusFlow" --replacing "FocusFlow" --no-restart >/dev/null
else
  dockutil --add "$APP" --label "FocusFlow" --no-restart >/dev/null
fi
killall Dock

echo "Installed ${APP}"
echo "Login service: ${LABEL}"
