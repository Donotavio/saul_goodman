#!/bin/bash
# Verifica se as versoes estao sincronizadas entre os 4 arquivos de package

ROOT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)")
MANIFEST=$(node -e "console.log(JSON.parse(require('fs').readFileSync('manifest.json','utf8')).version)")
DAEMON=$(node -e "console.log(JSON.parse(require('fs').readFileSync('saul-daemon/package.json','utf8')).version)")
VSCODE=$(node -e "console.log(JSON.parse(require('fs').readFileSync('vscode-extension/package.json','utf8')).version)")

echo "root:     $ROOT"
echo "manifest: $MANIFEST"
echo "daemon:   $DAEMON"
echo "vscode:   $VSCODE"

if [ "$ROOT" = "$MANIFEST" ] && [ "$ROOT" = "$DAEMON" ] && [ "$ROOT" = "$VSCODE" ]; then
  echo ""
  echo "OK: All versions match ($ROOT)"
  exit 0
else
  echo ""
  echo "FAIL: Version mismatch detected!"
  exit 1
fi
