package com.tareqsoft.prayer;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import org.json.JSONObject;

/**
 * Task reminder shown in the middle of the screen, over any app and on the lock screen.
 * The card itself is www/reminder.html (same design as inside the app).
 */
public class ReminderActivity extends Activity {
    private static final String CHANNEL = "agenda_reminders";
    private WebView web;
    private String data, title, body;

    /** Called by AlarmReceiver when a task reminder is due. */
    static void fire(Context c, String data, String title, String body) {
        int nid = nid(data);
        Intent show = new Intent(c, ReminderActivity.class)
            .putExtra("data", data).putExtra("title", title).putExtra("body", body)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int f = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent pi = PendingIntent.getActivity(c, 7000 + nid % 1000, show, f | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder nb;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "تذكير المهام", NotificationManager.IMPORTANCE_HIGH);
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[] { 0, 220, 120, 220 });
            ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            nm.createNotificationChannel(ch);
            nb = new Notification.Builder(c, CHANNEL);
        } else {
            nb = new Notification.Builder(c).setPriority(Notification.PRIORITY_MAX).setDefaults(Notification.DEFAULT_ALL);
        }
        nb.setContentTitle("⏰ " + title)
          .setContentText(body)
          .setStyle(new Notification.BigTextStyle().bigText(body))
          .setSmallIcon(android.R.drawable.ic_popup_reminder)
          .setCategory(Notification.CATEGORY_REMINDER)
          .setContentIntent(pi)
          .setFullScreenIntent(pi, true)
          .setAutoCancel(true);
        nm.notify(nid, nb.build());
        // مع إذن "العرض فوق التطبيقات" يُسمح بفتح النافذة مباشرة فوق أي تطبيق
        if (OverlayService.canDraw(c)) {
            try { c.startActivity(show); } catch (Exception e) { /* the full-screen notification still shows */ }
        }
    }

    /** نافذة حضور الموظفين (من المزامنة في الخلفية): إشعار عاجل + نافذة فوق التطبيقات إن سُمح بذلك. */
    static void fireAtt(Context c, String data, String title, String body) {
        Intent show = new Intent(c, ReminderActivity.class)
            .putExtra("data", data).putExtra("title", title).putExtra("body", body)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int f = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent pi = PendingIntent.getActivity(c, 7500, show, f | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder nb;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel("hr_attendance", "حضور الموظفين", NotificationManager.IMPORTANCE_HIGH);
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[] { 0, 120, 80, 120 });
            ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            nm.createNotificationChannel(ch);
            nb = new Notification.Builder(c, "hr_attendance");
        } else {
            nb = new Notification.Builder(c).setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        }
        nb.setContentTitle(title).setContentText(body)
          .setStyle(new Notification.BigTextStyle().bigText(body))
          .setSmallIcon(android.R.drawable.ic_dialog_info)
          .setCategory(Notification.CATEGORY_EVENT)
          .setContentIntent(pi)
          .setFullScreenIntent(pi, true)
          .setAutoCancel(true);
        nm.notify(5500, nb.build());
        if (OverlayService.canDraw(c)) {
            try { c.startActivity(show); } catch (Exception e) { /* الإشعار العاجل يكفي */ }
        }
    }

    /** الملخص الصباحي: إشعار عادي بأولوية عالية، يفتح الموارد البشرية عند القسم المعنيّ (go). */
    static void fireDigest(Context c, String title, String body, String go) {
        Intent show = new Intent(c, MainActivity.class).putExtra("tab", "hr").putExtra("go", go == null || go.isEmpty() ? "inbox" : go)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int f = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent pi = PendingIntent.getActivity(c, 7600, show, f | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder nb;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel("hr_digest", "الملخص الصباحي", NotificationManager.IMPORTANCE_HIGH);
            nm.createNotificationChannel(ch);
            nb = new Notification.Builder(c, "hr_digest");
        } else {
            nb = new Notification.Builder(c).setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        }
        nb.setContentTitle(title).setContentText(body)
          .setStyle(new Notification.BigTextStyle().bigText(body))
          .setSmallIcon(android.R.drawable.ic_dialog_info)
          .setContentIntent(pi)
          .setAutoCancel(true);
        nm.notify(5600, nb.build());
    }

    static int nid(String data) {
        try { JSONObject o = new JSONObject(data); if ("att".equals(o.optString("type"))) return 5500; return 4000 + Math.abs((o.optString("tid") + o.optString("ds")).hashCode() % 1000); }
        catch (Exception e) { return 4000; }
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        web.addJavascriptInterface(new Bridge(), "ReminderBridge");
        load(getIntent());
    }

    @Override
    protected void onNewIntent(Intent in) {
        super.onNewIntent(in);
        setIntent(in);
        load(in);
    }

    private void load(Intent in) {
        data = in.getStringExtra("data");
        title = in.getStringExtra("title");
        body = in.getStringExtra("body");
        if (data == null) { finish(); return; }
        web.loadUrl("file:///android_asset/www/reminder.html#" + Uri.encode(data));
    }

    @Override
    public void onBackPressed() { close(); }

    private void close() {
        ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).cancel(nid(data));
        finish();
        overridePendingTransition(0, android.R.anim.fade_out);
    }

    private void snooze(int min) {
        Intent in = new Intent(this, AlarmReceiver.class)
            .putExtra("popup", data).putExtra("title", title).putExtra("body", body);
        int f = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent pi = PendingIntent.getBroadcast(this, 5000 + nid(data) % 1000, in, f | PendingIntent.FLAG_UPDATE_CURRENT);
        Scheduler.setAlarm(this, System.currentTimeMillis() + min * 60000L, pi, true);
    }

    class Bridge {
        @JavascriptInterface public void close() { runOnUiThread(new Runnable() { public void run() { ReminderActivity.this.close(); } }); }
        @JavascriptInterface public void done() {
            // نطلب من التطبيق إعادة جدولة التذكيرات بعد الإنجاز في الخلفية
            sendBroadcast(new Intent(ReminderActivity.this, RefreshReceiver.class).setAction("com.tareqsoft.prayer.REFRESH"));
            close();
        }
        @JavascriptInterface public void snooze(final int min) {
            ReminderActivity.this.snooze(min);
            close();
        }
        @JavascriptInterface public void openTab(final String tab) {
            startActivity(new Intent(ReminderActivity.this, MainActivity.class).putExtra("tab", tab).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            close();
        }
        @JavascriptInterface public void open() {
            startActivity(new Intent(ReminderActivity.this, MainActivity.class).putExtra("tab", "agenda").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            close();
        }
    }
}
