#!/usr/bin/env bash
# إصدار نسخة جديدة: ./native/release.sh "1.2" "ملاحظات التحديث"
# يرفع versionCode تلقائياً، يبني ويوقّع الـ APK، ويحدّث dist/version.json الذي يقرأه التطبيق.
set -euo pipefail
cd "$(dirname "$0")/.."
NAME="${1:?usage: release.sh <versionName> [notes]}"
NOTES="${2:-}"
CODE=$(( $(grep -o 'versionCode="[0-9]*"' native/AndroidManifest.xml | grep -o '[0-9]*') + 1 ))
sed -i "s/android:versionCode=\"[0-9]*\" android:versionName=\"[^\"]*\"/android:versionCode=\"$CODE\" android:versionName=\"$NAME\"/" native/AndroidManifest.xml
bash native/build.sh
cp native/build/prayer.apk dist/prayer.apk
# نسخة الويب (تطبيق PWA) لنشرها عبر GitHub Pages من مجلد docs
rm -rf docs && mkdir docs && cp -r www/. docs/ && touch docs/.nojekyll
python3 - "$CODE" "$NAME" "$NOTES" <<'PY'
import json, sys
json.dump({"versionCode": int(sys.argv[1]), "versionName": sys.argv[2], "notes": sys.argv[3],
           "apk": "https://raw.githubusercontent.com/tareqsoft2025/tar/main/dist/prayer.apk"},
          open("dist/version.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
echo "released $NAME (code $CODE) -> dist/prayer.apk + dist/version.json"
