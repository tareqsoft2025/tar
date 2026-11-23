package com.tareqsoft.prayer;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** بعد دقيقتين من ترك التطبيق يُنهي جلسته على الخادم (النظام يقبل جلسة واحدة) ليتمكن المستخدم من الدخول من المتصفح. */
public class SessionRelease extends BroadcastReceiver {
    private static PendingIntent pi(Context c) {
        int f = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        return PendingIntent.getBroadcast(c, 7615, new Intent(c, SessionRelease.class).setAction("com.tareqsoft.prayer.SESSION_RELEASE"), f | PendingIntent.FLAG_UPDATE_CURRENT);
    }
    static void arm(Context c, long ms) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        long at = System.currentTimeMillis() + ms;
        if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi(c)); else am.set(AlarmManager.RTC_WAKEUP, at, pi(c));
    }
    static void cancel(Context c) { ((AlarmManager) c.getSystemService(Context.ALARM_SERVICE)).cancel(pi(c)); }
    @Override public void onReceive(final Context ctx, Intent in) {
        final PendingResult pr = goAsync();
        new Thread(new Runnable() { public void run() {
            try { ErpClient.releaseIfIdle(ctx.getApplicationContext()); } finally { pr.finish(); }
        } }).start();
    }
}
