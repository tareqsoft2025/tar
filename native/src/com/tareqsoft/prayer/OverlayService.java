package com.tareqsoft.prayer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;
import java.util.Locale;
import org.json.JSONObject;

/** Small draggable pill with the next prayer and live countdown, drawn over every app. */
public class OverlayService extends Service {
    private WindowManager wm;
    private TextView tv;
    private WindowManager.LayoutParams lp;
    private final Handler h = new Handler(Looper.getMainLooper());
    private final Runnable tick = new Runnable() {
        public void run() { update(); h.postDelayed(this, 1000); }
    };

    static boolean enabled(Context c) {
        return c.getSharedPreferences("prayer", MODE_PRIVATE).getBoolean("overlay_on", false);
    }

    static boolean canDraw(Context c) {
        return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c);
    }

    /** Starts or stops the service to match the setting and the permission. */
    static void sync(Context c) {
        try {
            Intent in = new Intent(c, OverlayService.class);
            if (enabled(c) && canDraw(c)) {
                if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(in); else c.startService(in);
            } else {
                c.stopService(in);
            }
        } catch (Exception e) { /* background start not allowed: retried on next tick */ }
    }

    @Override
    public int onStartCommand(Intent i, int flags, int id) {
        startForeground(902, foregroundNotification());
        if (tv == null && canDraw(this)) createView();
        h.removeCallbacks(tick);
        h.post(tick);
        return START_STICKY;
    }

    private Notification foregroundNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder nb;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel("overlay", "عرض الوقت فوق الشاشات", NotificationManager.IMPORTANCE_MIN);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
            nb = new Notification.Builder(this, "overlay");
        } else {
            nb = new Notification.Builder(this);
        }
        int f = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        return nb.setContentTitle("عرض الوقت المتبقي فوق الشاشات مفعّل")
            .setContentText("يمكن إيقافه من إعدادات التطبيق")
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentIntent(PendingIntent.getActivity(this, 2, new Intent(this, MainActivity.class), f))
            .setOngoing(true).build();
    }

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density); }

    private void createView() {
        wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        tv = new TextView(this);
        tv.setTextColor(Color.parseColor("#F1EEE6"));
        tv.setTextSize(15);
        tv.setGravity(Gravity.CENTER);
        tv.setPadding(dp(16), dp(8), dp(16), dp(8));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#E6132433"));
        bg.setCornerRadius(dp(22));
        bg.setStroke(dp(1), Color.parseColor("#D8B36A"));
        tv.setBackground(bg);
        lp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        lp.y = dp(40);
        tv.setOnTouchListener(new View.OnTouchListener() {
            float sx, sy; int oy, ox; boolean moved;
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN: sx = e.getRawX(); sy = e.getRawY(); oy = lp.y; ox = lp.x; moved = false; return true;
                    case MotionEvent.ACTION_MOVE:
                        if (Math.abs(e.getRawX() - sx) > 12 || Math.abs(e.getRawY() - sy) > 12) moved = true;
                        if (moved) { lp.x = ox + (int) (e.getRawX() - sx); lp.y = oy + (int) (e.getRawY() - sy); wm.updateViewLayout(tv, lp); }
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (!moved) {
                            Intent open = new Intent(OverlayService.this, MainActivity.class);
                            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(open);
                        }
                        return true;
                }
                return false;
            }
        });
        try { wm.addView(tv, lp); } catch (Exception e) { tv = null; }
    }

    private void update() {
        if (tv == null) return;
        JSONObject next = Scheduler.nextEntry(this);
        if (next == null) { tv.setText("افتح التطبيق"); return; }
        try {
            long s = Math.max(0, (next.getLong("at") - System.currentTimeMillis()) / 1000);
            tv.setText(String.format(Locale.US, "%s  %02d:%02d:%02d", next.getString("n"), s / 3600, (s / 60) % 60, s % 60));
        } catch (Exception e) { /* ignore */ }
    }

    @Override
    public void onDestroy() {
        h.removeCallbacks(tick);
        if (tv != null && wm != null) { try { wm.removeView(tv); } catch (Exception e) { /* ignore */ } }
        tv = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent i) { return null; }
}
