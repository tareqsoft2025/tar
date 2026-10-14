package com.tareqsoft.prayer;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/** Home-screen widget: next prayer, live countdown and today's five prayers. Times come from the page (saveTimes). */
public class PrayerWidget extends AppWidgetProvider {
    private static final String TICK = "com.tareqsoft.prayer.WIDGET_TICK";
    private static final String[] DAY = { "fajr", "dhuhr", "asr", "maghrib", "isha" };
    private static final int GOLD = 0xFFD8B36A, TEXT = 0xFFF1EEE6;

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) { updateAll(c); }

    @Override
    public void onReceive(Context c, Intent i) {
        super.onReceive(c, i);
        if (TICK.equals(i.getAction())) updateAll(c);
    }

    @Override
    public void onDisabled(Context c) {
        ((AlarmManager) c.getSystemService(Context.ALARM_SERVICE)).cancel(tickIntent(c));
    }

    private static PendingIntent tickIntent(Context c) {
        Intent in = new Intent(c, PrayerWidget.class);
        in.setAction(TICK);
        return PendingIntent.getBroadcast(c, 77, in, Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static String clock(long at) {
        TimeZone tz = TimeZone.getTimeZone("Asia/Hebron");
        SimpleDateFormat hm = new SimpleDateFormat("h:mm", Locale.US);
        SimpleDateFormat ap = new SimpleDateFormat("a", Locale.US);
        hm.setTimeZone(tz);
        ap.setTimeZone(tz);
        Date d = new Date(at);
        return hm.format(d) + " " + (ap.format(d).startsWith("A") ? "ص" : "م");
    }

    static void updateAll(Context c) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            int[] ids = m.getAppWidgetIds(new ComponentName(c, PrayerWidget.class));
            if (ids.length == 0) return;
            RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget);
            rv.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(c, 0, new Intent(c, MainActivity.class),
                Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));

            SharedPreferences sp = c.getSharedPreferences("prayer", Context.MODE_PRIVATE);
            JSONArray all = new JSONArray(sp.getString("times", "[]"));
            long now = System.currentTimeMillis();
            JSONObject next = null;
            for (int i = 0; i < all.length(); i++) {
                JSONObject o = all.getJSONObject(i);
                if (o.getLong("at") > now && (next == null || o.getLong("at") < next.getLong("at"))) next = o;
            }
            if (next == null) {
                rv.setTextViewText(R.id.w_name, "افتح التطبيق");
                rv.setTextViewText(R.id.w_time, "");
                rv.setChronometer(R.id.w_count, SystemClock.elapsedRealtime(), null, false);
            } else {
                long at = next.getLong("at");
                rv.setTextViewText(R.id.w_name, next.getString("n"));
                rv.setTextViewText(R.id.w_time, clock(at));
                if (Build.VERSION.SDK_INT >= 24) rv.setChronometerCountDown(R.id.w_count, true);
                rv.setChronometer(R.id.w_count, SystemClock.elapsedRealtime() + (at - now), null, true);
                String day = next.getString("d");
                int[] nameIds = { R.id.w_n0, R.id.w_n1, R.id.w_n2, R.id.w_n3, R.id.w_n4 };
                int[] timeIds = { R.id.w_t0, R.id.w_t1, R.id.w_t2, R.id.w_t3, R.id.w_t4 };
                for (int k = 0; k < DAY.length; k++) {
                    for (int i = 0; i < all.length(); i++) {
                        JSONObject o = all.getJSONObject(i);
                        if (o.getString("d").equals(day) && o.getString("k").equals(DAY[k])) {
                            boolean isNext = o.getString("k").equals(next.getString("k"));
                            rv.setTextViewText(nameIds[k], o.getString("n"));
                            rv.setTextViewText(timeIds[k], clock(o.getLong("at")));
                            rv.setTextColor(nameIds[k], isNext ? GOLD : 0xFF8FA2B2);
                            rv.setTextColor(timeIds[k], isNext ? GOLD : TEXT);
                        }
                    }
                }
                // refresh right when this prayer starts
                AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
                long when = at + 1500;
                boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
                if (Build.VERSION.SDK_INT >= 23) {
                    if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, tickIntent(c));
                    else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, tickIntent(c));
                } else {
                    am.set(AlarmManager.RTC_WAKEUP, when, tickIntent(c));
                }
            }
            m.updateAppWidget(ids, rv);
        } catch (Exception e) { /* ignore */ }
    }
}
