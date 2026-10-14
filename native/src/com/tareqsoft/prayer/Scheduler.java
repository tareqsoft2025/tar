package com.tareqsoft.prayer;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

/** Alarm scheduling + notification helpers shared by the activity and receivers. */
final class Scheduler {
    static final int MAX = 150;
    static final int REFRESH_CODE = 9999;
    static final String CHANNEL = "prayer";

    private Scheduler() {}

    private static int flags() {
        return Build.VERSION.SDK_INT >= 23
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;
    }

    private static AlarmManager am(Context c) { return (AlarmManager) c.getSystemService(Context.ALARM_SERVICE); }

    static void cancelAll(Context c) {
        AlarmManager a = am(c);
        for (int i = 0; i < MAX; i++) {
            a.cancel(PendingIntent.getBroadcast(c, i, new Intent(c, AlarmReceiver.class), flags()));
        }
    }

    private static void setAlarm(Context c, long at, PendingIntent pi, boolean exactWanted) {
        AlarmManager a = am(c);
        boolean exact = exactWanted && (Build.VERSION.SDK_INT < 31 || a.canScheduleExactAlarms());
        if (Build.VERSION.SDK_INT >= 23) {
            if (exact) a.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else a.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } else {
            a.set(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    /** json: [{"at":epochMillis,"title":"..","body":".."}, ...] */
    static void schedule(Context c, String json) {
        try {
            cancelAll(c);
            JSONArray arr = new JSONArray(json);
            long now = System.currentTimeMillis();
            int n = 0;
            for (int i = 0; i < arr.length() && n < MAX; i++) {
                JSONObject o = arr.getJSONObject(i);
                long at = o.getLong("at");
                if (at <= now) continue;
                Intent in = new Intent(c, AlarmReceiver.class);
                in.putExtra("title", o.optString("title"));
                in.putExtra("body", o.optString("body"));
                in.putExtra("id", n);
                setAlarm(c, at, PendingIntent.getBroadcast(c, n, in, flags()), true);
                n++;
            }
        } catch (Exception e) { /* ignore */ }
    }

    /** All prayer times (next days) for the home-screen widget: [{"k":"fajr","n":"الفجر","at":ms,"d":"yyyy-mm-dd"}, ...] */
    static void saveTimes(Context c, String json) {
        c.getSharedPreferences("prayer", Context.MODE_PRIVATE).edit().putString("times", json).apply();
        PrayerWidget.updateAll(c);
    }

    /** Re-run the background refresh (location + reschedule) after delayMs. */
    static void armRefresh(Context c, long delayMs) {
        Intent in = new Intent(c, RefreshReceiver.class);
        in.setAction("com.tareqsoft.prayer.REFRESH");
        setAlarm(c, System.currentTimeMillis() + delayMs, PendingIntent.getBroadcast(c, REFRESH_CODE, in, flags()), false);
    }

    static boolean notificationsAllowed(Context c) {
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        return Build.VERSION.SDK_INT < 24 || nm.areNotificationsEnabled();
    }

    static void notifyNow(Context c, int id, String title, String body) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder nb;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "تنبيهات الصلاة", NotificationManager.IMPORTANCE_HIGH));
            nb = new Notification.Builder(c, CHANNEL);
        } else {
            nb = new Notification.Builder(c);
        }
        int f = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        nb.setContentTitle(title)
          .setContentText(body)
          .setStyle(new Notification.BigTextStyle().bigText(body))
          .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
          .setContentIntent(PendingIntent.getActivity(c, 0, new Intent(c, MainActivity.class), f))
          .setAutoCancel(true);
        nm.notify(id, nb.build());
    }
}
