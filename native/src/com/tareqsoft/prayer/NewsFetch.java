package com.tareqsoft.prayer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * الأخبار من قناة تيليجرام العامة عبر معاينة الويب (t.me/s/القناة): جلب الصفحة والصور في الخلفية (WebView لا يستطيع بسبب CORS)،
 * وفحص دوري (كل 30 دقيقة) لإشعار المستخدم بالمنشور الجديد. المضيفات المسموحة محصورة بـ t.me وشبكة صور تيليجرام.
 */
public class NewsFetch extends JobService {
    static final int JOB_ID = 7314;
    static SharedPreferences sp(Context c) { return c.getSharedPreferences("news", Context.MODE_PRIVATE); }

    static boolean allowed(String url) {
        try {
            URL u = new URL(url); String h = u.getHost().toLowerCase(java.util.Locale.ROOT);
            if (!u.getProtocol().equals("https")) return false;
            return h.equals("t.me") || h.endsWith(".t.me") || h.endsWith("telesco.pe") || h.endsWith("telegram-cdn.org") || h.endsWith("cdn-telegram.org") || h.endsWith("telegram.org");
        } catch (Exception e) { return false; }
    }

    /** يجلب عنواناً (نص أو ثنائي) بحد أقصى max بايت. */
    static byte[] get(String url, int max) throws Exception {
        if (!allowed(url)) throw new Exception("مضيف غير مسموح");
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(25000); c.setInstanceFollowRedirects(true);
        c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"); c.setRequestProperty("Accept-Language", "ar,en;q=0.8");
        int code = c.getResponseCode(); if (code / 100 != 2) throw new Exception("HTTP " + code);
        if (c.getURL() != null && !allowed(c.getURL().toString())) throw new Exception("تحويل إلى مضيف غير مسموح");
        InputStream in = c.getInputStream(); ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] b = new byte[16384]; int n;
        while ((n = in.read(b)) > 0) { o.write(b, 0, n); if (o.size() > max) throw new Exception("الملف كبير"); }
        in.close(); return o.toByteArray();
    }

    /** يحفظ صورة في ملفات التطبيق (مرة واحدة) ويعيد مسارها. */
    static String image(Context c, String url) throws Exception {
        File dir = new File(c.getFilesDir(), "news"); dir.mkdirs();
        String name = Integer.toHexString(url.hashCode()) + ".jpg"; File f = new File(dir, name);
        if (!f.isFile() || f.length() == 0) { byte[] d = get(url, 4 * 1024 * 1024); FileOutputStream o = new FileOutputStream(f); o.write(d); o.close(); }
        return f.getAbsolutePath();
    }

    /* ---------- الفحص الدوري والإشعار ---------- */
    static void arm(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (!sp(c).getBoolean("notify", false) || sp(c).getString("chan", "").isEmpty()) { js.cancel(JOB_ID); return; }
        js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, NewsFetch.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(30 * 60_000L).setPersisted(true).build());
    }

    @Override public boolean onStartJob(final JobParameters p) {
        new Thread(new Runnable() { public void run() {
            try { checkNew(getApplicationContext()); } catch (Exception e) { /* المحاولة التالية */ }
            jobFinished(p, false);
        } }).start();
        return true;
    }
    @Override public boolean onStopJob(JobParameters p) { return true; }

    static void checkNew(Context c) throws Exception {
        String chan = sp(c).getString("chan", ""); if (!chan.matches("[A-Za-z0-9_]{4,40}")) return;
        String html = new String(get("https://t.me/s/" + chan, 2 * 1024 * 1024), "UTF-8");
        Matcher m = Pattern.compile("data-post=\"" + Pattern.quote(chan) + "/(\\d+)\"", Pattern.CASE_INSENSITIVE).matcher(html);
        long max = 0; while (m.find()) max = Math.max(max, Long.parseLong(m.group(1)));
        long last = sp(c).getLong("lastId", -1);
        if (max == 0) return;
        if (last < 0) { sp(c).edit().putLong("lastId", max).apply(); return; }   // أول فحص: نقطة البداية
        if (max <= last) return;
        // نص آخر منشور للإشعار
        String txt = ""; Matcher t = Pattern.compile("tgme_widget_message_text[^>]*>(.*?)</div>", Pattern.DOTALL).matcher(html); while (t.find()) txt = t.group(1);
        txt = txt.replaceAll("<br\\s*/?>", "\n").replaceAll("<[^>]+>", "").replace("&quot;", "\"").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&#33;", "!").trim();
        if (txt.length() > 220) txt = txt.substring(0, 220) + "…";
        sp(c).edit().putLong("lastId", max).apply();
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder nb;
        if (Build.VERSION.SDK_INT >= 26) { nm.createNotificationChannel(new NotificationChannel("news_new", "الأخبار", NotificationManager.IMPORTANCE_HIGH)); nb = new Notification.Builder(c, "news_new"); }
        else nb = new Notification.Builder(c).setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        int f = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent pi = PendingIntent.getActivity(c, 7617, new Intent(c, MainActivity.class).putExtra("tab", "news").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP), f | PendingIntent.FLAG_UPDATE_CURRENT);
        String title = "📰 منشور جديد في الأخبار";
        nb.setContentTitle(title).setContentText(txt.isEmpty() ? "منشور جديد" : txt.replace('\n', ' ')).setStyle(new Notification.BigTextStyle().bigText(txt.isEmpty() ? "منشور جديد" : txt)).setSmallIcon(R.drawable.ic_stat_digest).setContentIntent(pi).setAutoCancel(true);
        nm.notify(5617, nb.build());
        ReminderActivity.popup(c, "digest", title, txt.isEmpty() ? "منشور جديد" : txt, "news");
    }
}
