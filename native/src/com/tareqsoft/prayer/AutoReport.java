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
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setOverrideDeadline(120000).build());
    }

    /** يسلّم الملف: واتساب تلقائي إن أمكن، وإشعار للمشاركة اليدوية دائماً. */
    static void deliver(Context c, String b64, String name, String info) {
        Context app = c.getApplicationContext();
        JSONObject o = cfg(app);
        String fn = name.replaceAll("[^A-Za-z0-9._-]", "_"), msg = "تم تجهيز الملف (" + info + ")";
        try {
            byte[] data = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
            File dir = new File(app.getCacheDir(), "share"); dir.mkdirs();
            FileOutputStream fo = new FileOutputStream(new File(dir, fn)); fo.write(data); fo.close();
            Uri u = Uri.parse("content://com.tareqsoft.prayer.share/" + fn);
            String mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", cap = "كشف الدوام — " + fn.replaceAll("[^0-9-]", "").replaceAll("^-+|-+$", "");
            String digits = o.optString("number", "").replaceAll("[^0-9]", "");
            boolean sentWa = false;
            if (digits.length() >= 8) {
                String pkg = null;
                String[] ps = { "com.whatsapp", "com.whatsapp.w4b" };
                for (int i = 0; i < ps.length && pkg == null; i++) { try { app.getPackageManager().getPackageInfo(ps[i], 0); pkg = ps[i]; } catch (Exception e) { /* next */ } }
                if (pkg != null) {
                    Intent i = new Intent(Intent.ACTION_SEND).setPackage(pkg).setType(mime).putExtra(Intent.EXTRA_STREAM, u).putExtra(Intent.EXTRA_TEXT, cap).putExtra("jid", digits + "@s.whatsapp.net");
                    i.setClipData(android.content.ClipData.newRawUri("", u));
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    try { WaAutoService.arm(90000); app.startActivity(i); sentWa = true; msg += " وفُتح واتساب للإرسال"; } catch (Exception e) { msg += " (تعذّر فتح واتساب من الخلفية: فعّل «العرض فوق التطبيقات»)"; }
                } else msg += " (واتساب غير مثبّت)";
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
            status(app, true, msg);
        } catch (Exception e) { status(app, false, "تعذّر تسليم الملف: " + e.getMessage()); }
    }
}
