package com.tareqsoft.prayer;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import java.io.File;
import java.io.FileOutputStream;
import java.util.Calendar;
import org.json.JSONObject;

/**
 * التقرير اليومي التلقائي: منبّه دقيق في الوقت المحدد (يعمل والتطبيق مغلق) ← مهمة خلفية تبني ملف Excel (AutoReportJob)
 * ← يُفتح واتساب على رقم المستلم والملف مرفق وتضغط خدمة الإرسال التلقائي «إرسال»، مع إشعار احتياطي للمشاركة اليدوية.
 */
public class AutoReport extends BroadcastReceiver {
    static final String PREFS = "autorep";
    static final int JOB_ID = 7312, ALARM_ID = 7312, NOTIF_ID = 5612;

    static SharedPreferences sp(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** الإعدادات كـ JSON: {on,h,m,days:[0..6],number,scope,keys,day} + حالة آخر تشغيل. */
    static String get(Context c) {
        String s = sp(c).getString("cfg", "");
        try {
            JSONObject o = s.isEmpty() ? new JSONObject() : new JSONObject(s);
            o.put("lastAt", sp(c).getLong("lastAt", 0)); o.put("lastOk", sp(c).getBoolean("lastOk", false)); o.put("lastMsg", sp(c).getString("lastMsg", ""));
            o.put("next", nextAt(c));
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }

    static void save(Context c, String json) {
        try { new JSONObject(json); } catch (Exception e) { return; }
        sp(c).edit().putString("cfg", json).apply();
        schedule(c);
    }

    static void status(Context c, boolean ok, String msg) { sp(c).edit().putLong("lastAt", System.currentTimeMillis()).putBoolean("lastOk", ok).putString("lastMsg", msg == null ? "" : msg).apply(); }

    private static JSONObject cfg(Context c) { try { return new JSONObject(sp(c).getString("cfg", "{}")); } catch (Exception e) { return new JSONObject(); } }

    /** موعد التشغيل التالي (ms) أو 0 إن كان معطّلاً. */
    static long nextAt(Context c) {
        JSONObject o = cfg(c);
        if (!o.optBoolean("on", false)) return 0;
        org.json.JSONArray ds = o.optJSONArray("days");
        long now = System.currentTimeMillis();
        for (int i = 0; i < 9; i++) {
            Calendar cal = Calendar.getInstance();
            cal.add(Calendar.DAY_OF_YEAR, i);
            cal.set(Calendar.HOUR_OF_DAY, o.optInt("h", 15)); cal.set(Calendar.MINUTE, o.optInt("m", 0)); cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0);
            if (cal.getTimeInMillis() <= now + 5000) continue;
            int dow = cal.get(Calendar.DAY_OF_WEEK) - 1;   // 0 = الأحد
            boolean okDay = ds == null || ds.length() == 0;
            for (int k = 0; !okDay && k < ds.length(); k++) if (ds.optInt(k, -1) == dow) okDay = true;
            if (okDay) return cal.getTimeInMillis();
        }
        return 0;
    }

    static void schedule(Context c) {
        Context app = c.getApplicationContext();
        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        int f = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent pi = PendingIntent.getBroadcast(app, ALARM_ID, new Intent(app, AutoReport.class).setAction("com.tareqsoft.prayer.AUTO_REPORT"), f | PendingIntent.FLAG_UPDATE_CURRENT);
        am.cancel(pi);
        long at = nextAt(app);
        if (at <= 0) return;
        if (Build.VERSION.SDK_INT >= 23 && (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms())) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.set(AlarmManager.RTC_WAKEUP, at, pi);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        schedule(ctx);   // الموعد التالي
        run(ctx);
    }

    /** يبدأ مهمة بناء الملف وإرساله الآن (للاختبار أو عند الموعد). */
    static void run(Context c) {
        Context app = c.getApplicationContext();
        if (!ErpClient.hasSession(app) && !ErpClient.hasCreds(app)) { status(app, false, "غير مسجَّل الدخول في نظام PEF"); return; }
        JobScheduler js = (JobScheduler) app.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(app, AutoReportJob.class))
            .setMinimumLatency(0).setOverrideDeadline(15000).build());
    }

    // ===== قائمة المستلمين: واتساب يُفتح لكل رقم بالتتابع، وتضغط الخدمة «إرسال» ثم ننتقل للتالي =====
    private static final java.util.ArrayDeque<String> QUEUE = new java.util.ArrayDeque<String>();
    private static final android.os.Handler H = new android.os.Handler(android.os.Looper.getMainLooper());
    private static Uri qUri; private static String qMime, qCap, qPkg, qInfo, qCur;
    private static int qOk, qFail, qTotal;
    private static Runnable watchdog;

    static boolean queueActive() { return qCur != null; }

    private static java.util.List<String> numbersOf(JSONObject o) {
        java.util.ArrayList<String> l = new java.util.ArrayList<String>();
        org.json.JSONArray a = o.optJSONArray("numbers");
        if (a != null) for (int i = 0; i < a.length(); i++) { String d = a.optString(i, "").replaceAll("[^0-9]", ""); if (d.length() >= 8 && !l.contains(d)) l.add(d); }
        String one = o.optString("number", "").replaceAll("[^0-9]", "");
        if (l.isEmpty() && one.length() >= 8) l.add(one);
        return l;
    }

    /** يفتح واتساب على المستلم التالي، أو يُنهي ويكتب الحالة. */
    static void sendNext(final Context app) {
        if (watchdog != null) { H.removeCallbacks(watchdog); watchdog = null; }
        String n = QUEUE.poll();
        if (n == null) {
            qCur = null;
            status(app, qOk > 0, qInfo + " — أُرسل إلى " + qOk + " من " + qTotal + (qFail > 0 ? " (تعذّر " + qFail + ": فعّل خدمة الإرسال والعرض فوق التطبيقات)" : ""));
            return;
        }
        qCur = n;
        Intent i = new Intent(Intent.ACTION_SEND).setPackage(qPkg).setType(qMime).putExtra(Intent.EXTRA_STREAM, qUri).putExtra(Intent.EXTRA_TEXT, qCap).putExtra("jid", n + "@s.whatsapp.net");
        i.setClipData(android.content.ClipData.newRawUri("", qUri));
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try { WaAutoService.arm(60000); app.startActivity(i); }
        catch (Exception e) { qFail++; sendNext(app); return; }
        final Context c = app;
        watchdog = new Runnable() { public void run() { watchdog = null; if (!"sent".equals(WaAutoService.state)) qFail++; else qOk++; sendNext(c); } };
        H.postDelayed(watchdog, 66000);
    }

    /** تستدعيه خدمة الإمكانية بعد الضغط على «إرسال». */
    static void onSent(Context app) {
        if (watchdog != null) { H.removeCallbacks(watchdog); watchdog = null; }
        qOk++;
        sendNext(app);
    }

    private static final String[] DAYS = { "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت" };

    /** نص الشرح: «مرفق التقرير اليومي» + اليوم والتاريخ والساعة + آخر تحديث للبيانات. */
    static String caption(long stampMs) {
        java.util.Calendar c = java.util.Calendar.getInstance();
        String t = new java.text.SimpleDateFormat("h:mm", java.util.Locale.US).format(c.getTime()) + (c.get(java.util.Calendar.AM_PM) == java.util.Calendar.AM ? " ص" : " م");
        String d = DAYS[c.get(java.util.Calendar.DAY_OF_WEEK) - 1] + " " + new java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.US).format(c.getTime());
        String s = "مرفق التقرير اليومي\n" + d + " — الساعة " + t;
        if (stampMs > 0) {
            java.util.Calendar u = java.util.Calendar.getInstance(); u.setTimeInMillis(stampMs);
            s += "\nآخر تحديث للبيانات: " + new java.text.SimpleDateFormat("h:mm", java.util.Locale.US).format(u.getTime()) + (u.get(java.util.Calendar.AM_PM) == java.util.Calendar.AM ? " ص" : " م");
        }
        return s;
    }

    static String stampText(long ms) {
        if (ms <= 0) return "";
        java.util.Calendar u = java.util.Calendar.getInstance(); u.setTimeInMillis(ms);
        return new java.text.SimpleDateFormat("h:mm", java.util.Locale.US).format(u.getTime()) + (u.get(java.util.Calendar.AM_PM) == java.util.Calendar.AM ? " ص" : " م");
    }

    /** يبدأ إرسال آخر ملف جاهز إلى كل الأرقام (يُستدعى عند ضغط المستخدم «إرسال» في الإشعار أو النافذة). */
    static boolean sendPrepared(Context c) {
        Context app = c.getApplicationContext();
        String fn = sp(app).getString("pName", "");
        File f = new File(new File(app.getCacheDir(), "share"), fn);
        if (fn.isEmpty() || !f.isFile()) { status(app, false, "لا يوجد ملف جاهز للإرسال"); return false; }
        java.util.List<String> nums = numbersOf(cfg(app));
        if (nums.isEmpty()) { status(app, false, "لا توجد أرقام مستلمين: أضفها من الإعدادات"); return false; }
        String pkg = null; String[] ps = { "com.whatsapp", "com.whatsapp.w4b" };
        for (int i = 0; i < ps.length && pkg == null; i++) { try { app.getPackageManager().getPackageInfo(ps[i], 0); pkg = ps[i]; } catch (Exception e) { /* next */ } }
        if (pkg == null) { status(app, false, "واتساب غير مثبّت"); return false; }
        if (qCur != null) return true;   // إرسال جارٍ
        qUri = Uri.parse("content://com.tareqsoft.prayer.share/" + fn);
        qMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; qPkg = pkg;
        qCap = caption(sp(app).getLong("pStamp", 0)); qInfo = "أُرسل " + fn;
        qOk = 0; qFail = 0; qTotal = nums.size(); QUEUE.clear(); QUEUE.addAll(nums);
        WaAutoService.caption = qCap;
        sendNext(app);
        return true;
    }

    /** إشعار + نافذة منبثقة في منتصف الشاشة: «التقرير اليومي جاهز» مع آخر تحديث وزر إرسال (يعمل والتطبيق مغلق). */
    static void notifyReady(Context app, String name, long stampMs) {
        String upd = stampText(stampMs), body = "مرفق التقرير اليومي" + (upd.isEmpty() ? "" : "\nآخر تحديث للبيانات: " + upd) + "\nالملف: " + name;
        Intent go = new Intent(app, SendReportActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int f = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent pi = PendingIntent.getActivity(app, 7614, go, f | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder nb;
        if (Build.VERSION.SDK_INT >= 26) { NotificationChannel ch = new NotificationChannel("hr_autorep2", "التقرير اليومي جاهز", NotificationManager.IMPORTANCE_HIGH); nm.createNotificationChannel(ch); nb = new Notification.Builder(app, "hr_autorep2"); }
        else nb = new Notification.Builder(app).setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        nb.setContentTitle("📊 أرسل التقرير اليومي").setContentText(upd.isEmpty() ? "اضغط للإرسال" : "آخر تحديث " + upd + " — اضغط للإرسال")
          .setStyle(new Notification.BigTextStyle().bigText(body)).setSmallIcon(R.drawable.ic_stat_digest).setContentIntent(pi)
          .addAction(new Notification.Action.Builder(R.drawable.ic_stat_digest, "إرسال", pi).build()).setCategory(Notification.CATEGORY_REMINDER)
          .setFullScreenIntent(pi, true).setAutoCancel(true);
        nm.notify(NOTIF_ID, nb.build());
        ReminderActivity.popup(app, "report", "أرسل التقرير اليومي", body, "sendreport");
    }

    /** نص البريد: الموضوع ثابت، والمتن فيه تاريخ ووقت تحديث البيانات والسجلات. */
    static String mailSubject() { return "تقرير الحضور والانصراف اليوم"; }
    static String mailBody(long stampMs) {
        java.util.Calendar u = java.util.Calendar.getInstance(); if (stampMs > 0) u.setTimeInMillis(stampMs);
        String when = DAYS[u.get(java.util.Calendar.DAY_OF_WEEK) - 1] + " " + new java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.US).format(u.getTime()) + " — الساعة " + stampText(stampMs > 0 ? stampMs : System.currentTimeMillis());
        return "مرفق تقرير اكسل بحالة الدوام\nتاريخ تحديث البيانات والسجلات: " + when;
    }

    /** يسلّم الملف: واتساب تلقائي إن أمكن، وإشعار للمشاركة اليدوية دائماً. */
    static void deliver(Context c, String b64, String name, String info, long stamp) {
        Context app = c.getApplicationContext();
        JSONObject o = cfg(app);
        String fn = name.replaceAll("[^A-Za-z0-9._-]", "_"), msg = "تم تجهيز الملف (" + info + ")";
        try {
            byte[] data = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
            File dir = new File(app.getCacheDir(), "share"); dir.mkdirs();
            FileOutputStream fo = new FileOutputStream(new File(dir, fn)); fo.write(data); fo.close();
            Uri u = Uri.parse("content://com.tareqsoft.prayer.share/" + fn);
            String mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", cap = caption(stamp);
            sp(app).edit().putString("pName", fn).putLong("pStamp", stamp).putLong("pAt", System.currentTimeMillis()).apply();
            String mailMsg = "";
            if (MailSender.enabled(app)) {
                String err = MailSender.send(app, mailSubject(), mailBody(stamp), fn, data);
                mailMsg = err == null ? " · أُرسل بالبريد" : " · تعذّر البريد: " + err;
            }
            msg += mailMsg;
            if (!"auto".equals(o.optString("mode", "ask"))) { status(app, true, msg + " — بانتظار ضغطك على «إرسال» في الإشعار"); notifyReady(app, fn, stamp); return; }
            java.util.List<String> nums = numbersOf(o);
            boolean sentWa = false;
            if (!nums.isEmpty()) {
                String pkg = null;
                String[] ps = { "com.whatsapp", "com.whatsapp.w4b" };
                for (int i = 0; i < ps.length && pkg == null; i++) { try { app.getPackageManager().getPackageInfo(ps[i], 0); pkg = ps[i]; } catch (Exception e) { /* next */ } }
                if (pkg != null && qCur == null) {
                    qUri = u; qMime = mime; qCap = cap; WaAutoService.caption = cap; qPkg = pkg; qInfo = msg; qOk = 0; qFail = 0; qTotal = nums.size();
                    QUEUE.clear(); QUEUE.addAll(nums);
                    sentWa = true; msg += " وسيُرسل إلى " + nums.size() + " رقم بالتتابع";
                    sendNext(app);
                } else if (pkg == null) msg += " (واتساب غير مثبّت)";
            }
            // إشعار: مشاركة يدوية بنقرة (احتياط إن لم يُرسَل تلقائياً)
            Intent sh = new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, u).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent ch = Intent.createChooser(sh, "مشاركة التقرير").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            int f = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
            PendingIntent pi = PendingIntent.getActivity(app, 7613, ch, f | PendingIntent.FLAG_UPDATE_CURRENT);
            NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
            Notification.Builder nb;
            if (Build.VERSION.SDK_INT >= 26) { nm.createNotificationChannel(new NotificationChannel("hr_autorep", "التقرير التلقائي", NotificationManager.IMPORTANCE_DEFAULT)); nb = new Notification.Builder(app, "hr_autorep"); }
            else nb = new Notification.Builder(app);
            nb.setContentTitle("تقرير الدوام جاهز").setContentText(sentWa ? "أُرسل إلى واتساب — اضغط للمشاركة يدوياً إن لزم" : "اضغط لمشاركة ملف Excel").setSmallIcon(R.drawable.ic_stat_digest).setContentIntent(pi).setAutoCancel(true);
            nm.notify(NOTIF_ID, nb.build());
            if (!sentWa) status(app, true, msg);
        } catch (Exception e) { status(app, false, "تعذّر تسليم الملف: " + e.getMessage()); }
    }
}
