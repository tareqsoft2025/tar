package com.tareqsoft.prayer;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONObject;

/**
 * Foreground "watch" service: keeps checking the ERP for new attendance every few minutes even when the app is
 * closed (small incremental requests, friendly to a weak 2G link) and raises the centre-screen popup.
 */
public class HrWatchService extends Service {
    private static final String PREFS = "prayer";
    private static final int NID = 903;
    private final Handler h = new Handler(Looper.getMainLooper());
    private WebView web;
    private boolean running = false;
    private PowerManager.WakeLock wl;

    static int minutes(Context c) { return c.getSharedPreferences(PREFS, MODE_PRIVATE).getInt("watch_min", 0); }

    /** minutes <= 0 stops watching. */
    static void set(Context c, int minutes) {
        c.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt("watch_min", Math.max(0, minutes)).apply();
        if (minutes <= 0) {
            cancelTick(c);
            c.stopService(new Intent(c, HrWatchService.class));
        } else start(c, false);
    }

    /** After boot / app update / periodic refresh. */
    static void resume(Context c) { if (minutes(c) > 0) start(c, false); }

    private static void start(Context c, boolean tick) {
        try {
            Intent in = new Intent(c, HrWatchService.class).putExtra("tick", tick);
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(in); else c.startService(in);
        } catch (Exception e) { /* background start refused: the next alarm or app open retries */ }
    }

    private static PendingIntent tickIntent(Context c) {
        Intent in = new Intent(c, HrWatchService.class).putExtra("tick", true);
        int f = (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0) | PendingIntent.FLAG_UPDATE_CURRENT;
        return Build.VERSION.SDK_INT >= 26 ? PendingIntent.getForegroundService(c, 7390, in, f) : PendingIntent.getService(c, 7390, in, f);
    }

    private static void cancelTick(Context c) {
        ((AlarmManager) c.getSystemService(Context.ALARM_SERVICE)).cancel(tickIntent(c));
    }

    private static void armTick(Context c) {
        int m = minutes(c);
        if (m <= 0) return;
        Scheduler.setAlarm(c, System.currentTimeMillis() + m * 60_000L, tickIntent(c), false);
    }

    static String state(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, MODE_PRIVATE);
        try {
            return new JSONObject().put("min", p.getInt("watch_min", 0)).put("last", p.getLong("watch_last", 0)).put("ok", p.getBoolean("watch_ok", true)).toString();
        } catch (Exception e) { return "{}"; }
    }

    static boolean batteryOk(Context c) {
        if (Build.VERSION.SDK_INT < 23) return true;
        return ((PowerManager) c.getSystemService(Context.POWER_SERVICE)).isIgnoringBatteryOptimizations(c.getPackageName());
    }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent i, int flags, int id) {
        if (minutes(this) <= 0) { stopSelf(); return START_NOT_STICKY; }
        startForeground(NID, note());
        armTick(this);
        boolean tick = i == null || i.getBooleanExtra("tick", true) || !running;
        if (tick) check();
        return START_STICKY;
    }

    private Notification note() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder nb;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel("hr_watch", "متابعة الحضور في الخلفية", NotificationManager.IMPORTANCE_MIN);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
            nb = new Notification.Builder(this, "hr_watch");
        } else nb = new Notification.Builder(this);
        long last = getSharedPreferences(PREFS, MODE_PRIVATE).getLong("watch_last", 0);
        SimpleDateFormat f = new SimpleDateFormat("h:mm a", new Locale("ar"));
        f.setTimeZone(TimeZone.getTimeZone("Asia/Hebron"));
        String txt = last == 0 ? "بانتظار أول فحص…" : "آخر فحص " + f.format(new Date(last)) + " · كل " + minutes(this) + " د";
        int fl = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        return nb.setContentTitle("متابعة حضور الموظفين مفعّلة")
            .setContentText(txt)
            .setSmallIcon(android.R.drawable.ic_popup_sync)
            .setOngoing(true)
            .setContentIntent(PendingIntent.getActivity(this, 3, new Intent(this, MainActivity.class).putExtra("tab", "hr"), fl))
            .build();
    }

    private void refreshNote() {
        try { ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(NID, note()); } catch (Exception e) { /* ignore */ }
    }

    private void check() {
        if (running) return;
        // والتطبيق مفتوح أمام المستخدم فهو يزامن بنفسه ويعرض النافذة داخله
        if (MainActivity.visible) return;
        if (!ErpClient.hasSession(this) && !ErpClient.hasCreds(this)) return;
        running = true;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "prayer:hrwatch");
        wl.acquire(150_000L);
        final Runnable finish = new Runnable() {
            public void run() {
                if (!running) return;
                running = false;
                try { if (web != null) web.destroy(); } catch (Exception e) { /* ignore */ }
                web = null;
                try { if (wl != null && wl.isHeld()) wl.release(); } catch (Exception e) { /* ignore */ }
                refreshNote();
            }
        };
        web = new WebView(getApplicationContext());
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface public void erpGet(final String id, final String path) {
                new Thread(new Runnable() { public void run() {
                    final ErpClient.Res r = ErpClient.get(HrWatchService.this, path);
                    h.post(new Runnable() { public void run() {
                        if (web != null) web.evaluateJavascript("window.__erp&&window.__erp(" + JSONObject.quote(id) + "," + r.status + "," + JSONObject.quote(r.body) + ")", null);
                    } });
                } }).start();
            }
            @JavascriptInterface public boolean erpSession() { return ErpClient.hasSession(HrWatchService.this); }
            @JavascriptInterface public String netInfo() { return ErpClient.netInfo(HrWatchService.this); }
            @JavascriptInterface public boolean hrPut(String name, String data) { try { ErpClient.put(HrWatchService.this, name, data); return true; } catch (Exception e) { return false; } }
            @JavascriptInterface public String hrGet(String name) { return ErpClient.read(HrWatchService.this, name); }
            @JavascriptInterface public void attAlert(String data, String title, String body) { ReminderActivity.fireAtt(getApplicationContext(), data, title, body); }
            @JavascriptInterface public void done(boolean ok) {
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putLong("watch_last", System.currentTimeMillis()).putBoolean("watch_ok", ok).apply();
                h.post(finish);
            }
            @JavascriptInterface public void done() { done(true); }
        }, "AndroidBridge");
        web.loadUrl("file:///android_asset/www/hr-sync.html#quick");
        h.postDelayed(finish, 100_000L);
    }

    @Override
    public void onDestroy() {
        try { if (web != null) web.destroy(); } catch (Exception e) { /* ignore */ }
        try { if (wl != null && wl.isHeld()) wl.release(); } catch (Exception e) { /* ignore */ }
        super.onDestroy();
    }
}
