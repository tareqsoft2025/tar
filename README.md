# مواقيت الصلاة (تطبيق أندرويد)

تطبيق مبني بـ Capacitor (HTML/JS) يعرض: مواقيت الصلاة (حساب محلي بدون إنترنت)، العد التنازلي للصلاة القادمة، التاريخ الهجري، اتجاه القبلة بالبوصلة، مسبحة إلكترونية، وتنبيهات عند دخول الوقت.

## الحصول على ملف APK
1. ادفع الكود إلى GitHub (يتم البناء تلقائياً) أو شغّل **Actions → Build Android APK → Run workflow**.
2. بعد انتهاء العمل، نزّل `prayer-app-apk` من قسم **Artifacts** وفك الضغط ثم ثبّت `app-debug.apk` على الجوال (فعّل "التثبيت من مصادر غير معروفة").

## البناء محلياً
يتطلب Node 20 و JDK 17 و Android SDK:
```
npm ci
npx cap add android && npx cap sync android
cd android && ./gradlew assembleDebug
```
الملف الناتج: `android/app/build/outputs/apk/debug/app-debug.apk`

## بناء APK بدون Android SDK
```
bash native/build.sh      # الناتج: native/build/prayer.apk (نسخة جاهزة في dist/prayer.apk)
```
يستخدم WebView أصلي (Java) مع نفس واجهة `www/`. التوقيع بمفتاح تجريبي (`native/debug.p12`) ويتطلب أندرويد 7.0 فأعلى.

## التحديث الإجباري التلقائي
عند كل فتح للتطبيق يقرأ `dist/version.json` من فرع `main`؛ إذا كان `versionCode` فيه أحدث من المثبّت تظهر شاشة تحديث لا يمكن تجاوزها، تنزّل `dist/prayer.apk` وتفتح نافذة التثبيت.
لإصدار نسخة جديدة بعد أي تعديل:
```
./native/release.sh 1.3 "ملاحظات التحديث"
git add -A && git commit -m "release 1.3" && git push   # ثم ادمج في main
```

## تطبيق ويب قابل للإضافة (PWA)
مجلد `docs/` نسخة ويب كاملة من التطبيق (تعمل دون إنترنت بعد أول فتح). فعّل **Settings → Pages → Deploy from a branch → main / docs**، ثم افتح الرابط في Chrome واختر "إضافة إلى الشاشة الرئيسية" لتثبيته كتطبيق مصغّر.
