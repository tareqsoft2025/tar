package com.tareqsoft.prayer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder nb;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel("prayer", "Prayer times", NotificationManager.IMPORTANCE_HIGH);
            nm.createNotificationChannel(ch);
            nb = new Notification.Builder(c, "prayer");
        } else {
            nb = new Notification.Builder(c);
        }
        Intent open = new Intent(c, MainActivity.class);
        int f = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        nb.setContentTitle(i.getStringExtra("title"))
          .setContentText(i.getStringExtra("body"))
          .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
          .setContentIntent(PendingIntent.getActivity(c, 0, open, f))
          .setAutoCancel(true);
        nm.notify(i.getIntExtra("id", 0), nb.build());
    }
}
