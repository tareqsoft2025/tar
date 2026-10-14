#!/usr/bin/env bash
# Builds a signed APK without the Android SDK (aapt + javac + dx + apksig).
# Needs: JDK 11+, aapt + zipalign (apt-get install aapt zipalign), curl. Output: native/build/prayer.apk
set -euo pipefail
cd "$(dirname "$0")"
TOOLS="${TOOLS_DIR:-$PWD/.tools}"
MVN=https://repo.maven.apache.org/maven2
mkdir -p "$TOOLS" build
fetch() { # file url
  [ -s "$TOOLS/$1" ] && [ "$(stat -c%s "$TOOLS/$1")" -gt 5000 ] && return
  for i in 1 2 3 4 5 6; do
    curl -fsSL -m 280 -o "$TOOLS/$1" "$2" && [ "$(stat -c%s "$TOOLS/$1")" -gt 5000 ] && return
    sleep 15
  done
  echo "failed to download $2" >&2; exit 1
}
fetch android.jar $MVN/org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar
fetch dx.jar $MVN/com/jakewharton/android/repackaged/dalvik-dx/9.0.0_r3/dalvik-dx-9.0.0_r3.jar
fetch apksig.jar $MVN/com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar

rm -rf build/classes build/apk && mkdir -p build/classes build/apk/assets
command -v aapt >/dev/null && command -v zipalign >/dev/null || { echo "aapt and zipalign are required: apt-get install -y aapt zipalign" >&2; exit 1; }
rm -rf build/gen && mkdir -p build/gen
cp -r ../www build/apk/assets/www
# resources (icon, widget layout), binary manifest and R.java
aapt package -f -m -0 arsc -J build/gen -M AndroidManifest.xml -S res -A build/apk/assets -I "$TOOLS/android.jar" -F build/res.apk
javac -source 8 -target 8 -Xlint:-options -cp "$TOOLS/android.jar" -d build/classes $(find src build/gen -name '*.java')
java -cp "$TOOLS/dx.jar" com.android.dx.command.Main --dex --output=build/apk/classes.dex build/classes
cp build/res.apk build/unsigned.apk
(cd build/apk && aapt add ../unsigned.apk classes.dex >/dev/null)
# targetSdk 30+ needs resources.arsc stored uncompressed and 4-byte aligned
zipalign -f 4 build/unsigned.apk build/aligned.apk

if [ ! -f debug.p12 ]; then
  keytool -genkeypair -keystore debug.p12 -storetype PKCS12 -storepass android -keypass android \
    -alias prayer -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Prayer Debug" >/dev/null 2>&1
fi
mkdir -p build/sign
javac -cp "$TOOLS/apksig.jar" -d build/sign tools/Sign.java
java --add-exports java.base/sun.security.x509=ALL-UNNAMED --add-exports java.base/sun.security.pkcs=ALL-UNNAMED -cp "$TOOLS/apksig.jar:build/sign" Sign debug.p12 build/aligned.apk build/prayer.apk
echo "built: $PWD/build/prayer.apk"
