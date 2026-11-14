# قواعد ثابتة للمشروع

## بعد كل تحديث/إصدار (تلقائياً ودون انتظار طلب)
1. نفّذ الإصدار: `bash native/build.sh` ← رفع `prayer-vNN` في `www/sw.js` ← `./native/release.sh X.Y "ملاحظات"` ← commit ← دمج `-s ours` مع `origin/main` وفرع التطوير ← push ← PR ← squash merge.
2. **أكّد الدمج والتحديث الإجباري دائماً** بعد الدمج مباشرة:
   - آخر commit على `origin/main` هو الإصدار الجديد.
   - `dist/version.json` على main (الرابط الخام مع `?t=` لتجاوز الكاش) يحمل `versionCode`/`versionName` الجديدين.
   - تنزيل `dist/prayer.apk` من الرابط الخام وفحصه بـ `aapt dump badging` للتأكد من نفس الإصدار.
3. أبلغ المستخدم بنتيجة التأكيد (الدمج + التحديث الإجباري) في ختام كل إصدار، مع أي حدود معروفة.
