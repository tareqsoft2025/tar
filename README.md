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
