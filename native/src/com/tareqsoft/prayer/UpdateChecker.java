package com.tareqsoft.prayer;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;

/**
 * Background update check (hourly, after boot and after an app update): when a newer version is published,
 * downloads the APK silently and shows a notification; tapping it opens the installer right away.
 */
public class UpdateChecker extends BroadcastReceiver {
    static final String VERSION_URL = "https://raw.githubusercontent.com/tareqsoft2025/tar/main/dist/version.json";
    static final String APK_PREFIX = "https://raw.githubusercontent.com/tareqsoft2025/tar/";
    static final String ACTION = "com.tareqsoft.prayer.CHECK_UPDATE";
    private static final String CHANNEL = "updates";
    private static final int NOTIF_ID = 950;
    private static volatile boolean running = false;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        final Context app = ctx.getApplicationContext();
        final PendingResult pr = goAsync();
        new Thread(new Runnable() {
            public void run() {
                try { check(app); } finally { pr.finish(); }
            }
        }).start();
    }

    /** Arms an inexact hourly alarm (battery friendly); safe to call repeatedly. */
    static void arm(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        Intent i = new Intent(c, UpdateChecker.class).setAction(ACTION);
        int f = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent pi = PendingIntent.getBroadcast(c, 9500, i, f | PendingIntent.FLAG_UPDATE_CURRENT);
        am.setInexactRepeating(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + 5 * 60 * 1000L,
            AlarmManager.INTERVAL_HOUR, pi);
    }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("prayer", Context.MODE_PRIVATE); }

    static int currentVersion(Context c) {
        try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionCode; }
        catch (Exception e) { return Integer.MAX_VALUE; }
    }

    /** True when the APK of this version code is already fully downloaded. */
    static boolean ready(Context c, int code) {
        File f = UpdateProvider.apk(c);
        return code > currentVersion(c) && prefs(c).getInt("dl_code", 0) == code && f.exists() && f.length() > 0;
    }

    /** Fetches version.json; returns it when newer than the installed app, else null. Clears stale downloads. */
    static JSONObject latest(Context c) throws Exception {
        if (prefs(c).getInt("dl_code", 0) <= currentVersion(c)) {
            UpdateProvider.apk(c).delete();
            prefs(c).edit().remove("dl_code").apply();
        }
        JSONObject o = new JSONObject(new String(readAll(open(VERSION_URL, 8000)), "UTF-8"));
        return o.getInt("versionCode") > currentVersion(c) ? o : null;
    }

    /** Full background flow: check, download, notify. */
    static void check(Context c) {
        if (running) return;
        running = true;
        try {
            JSONObject o = latest(c);
            if (o == null) { cancelNotification(c); return; }
            int code = o.getInt("versionCode");
            if (!ready(c, code)) download(c, o.getString("apk"), code, null);
            if (ready(c, code) && prefs(c).getInt("notified_code", 0) != code) {
                notifyReady(c, o.optString("versionName", ""), o.optString("notes", ""));
                prefs(c).edit().putInt("notified_code", code).apply();
            }
        } catch (Exception e) {
            /* offline or server error: try again next hour */
        } finally { running = false; }
    }

    interface Progress { void on(int pct); }

    /** Downloads to a temp file and renames it only when complete, so a half file is never installed. */
    static void download(Context c, String url, int code, Progress p) throws Exception {
        if (!url.startsWith(APK_PREFIX)) throw new SecurityException("untrusted url");
        HttpURLConnection con = open(url, 15000);
        int total = con.getContentLength();
        File tmp = new File(c.getFilesDir(), "update.part");
        InputStream in = con.getInputStream();
        FileOutputStream out = new FileOutputStream(tmp);
        byte[] buf = new byte[16384];
        long done = 0;
        int n, last = -1;
        try {
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                done += n;
                int pct = total > 0 ? (int) (done * 100 / total) : 0;
                if (p != null && pct != last) { last = pct; p.on(pct); }
            }
        } finally { out.close(); in.close(); }
        if (done == 0 || (total > 0 && done != total)) { tmp.delete(); throw new java.io.IOException("incomplete"); }
        File f = UpdateProvider.apk(c);
        f.delete();
        if (!tmp.renameTo(f)) throw new java.io.IOException("rename failed");
        prefs(c).edit().putInt("dl_code", code).apply();
    }

    /** Opens the system installer for the downloaded APK. */
    static void install(Context c) {
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(android.net.Uri.parse("content://com.tareqsoft.prayer.update/update.apk"), "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        c.startActivity(i);
    }

    private static void notifyReady(Context c, String name, String notes) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder nb;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "تحديثات التطبيق", NotificationManager.IMPORTANCE_HIGH));
            nb = new Notification.Builder(c, CHANNEL);
        } else nb = new Notification.Builder(c).setPriority(Notification.PRIORITY_HIGH);
        int f = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        Intent open = new Intent(c, MainActivity.class).putExtra("install", true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        String body = (notes == null || notes.isEmpty()) ? "اضغط للتثبيت الآن" : notes + "\nاضغط للتثبيت الآن";
        nb.setContentTitle("تحديث جديد جاهز" + (name.isEmpty() ? "" : " (الإصدار " + name + ")"))
          .setContentText(body)
          .setStyle(new Notification.BigTextStyle().bigText(body))
          .setSmallIcon(android.R.drawable.stat_sys_download_done)
          .setContentIntent(PendingIntent.getActivity(c, 9501, open, f | PendingIntent.FLAG_UPDATE_CURRENT))
          .setAutoCancel(true);
        nm.notify(NOTIF_ID, nb.build());
    }

    static void cancelNotification(Context c) {
        ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(NOTIF_ID);
    }

    static HttpURLConnection open(String url, int timeout) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url + (url.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis()).openConnection();
        c.setConnectTimeout(timeout);
        c.setReadTimeout(timeout * 3);
        c.setUseCaches(false);
        c.setRequestProperty("Cache-Control", "no-cache");
        return c;
    }

    static byte[] readAll(HttpURLConnection c) throws Exception {
        InputStream in = c.getInputStream();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toByteArray();
    }
}
