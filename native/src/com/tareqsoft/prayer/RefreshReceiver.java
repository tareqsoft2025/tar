package com.tareqsoft.prayer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Runs in the background (every ~6h, after boot and after an app update): reads the last known location,
 * lets the page logic recompute prayer times and re-arms the notification alarms.
 */
public class RefreshReceiver extends BroadcastReceiver {
    private static final long INTERVAL = 6L * 60 * 60 * 1000;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        final Context app = ctx.getApplicationContext();
        final PendingResult pr = goAsync();
        Scheduler.armRefresh(app, INTERVAL);
        Location loc = bestLocation(app);
        final String url = "file:///android_asset/www/refresh.html"
            + (loc == null ? "" : String.format(Locale.US, "?lat=%.5f&lon=%.5f", loc.getLatitude(), loc.getLongitude()));
        final Handler h = new Handler(Looper.getMainLooper());
        h.post(new Runnable() {
            public void run() {
                final AtomicBoolean finished = new AtomicBoolean(false);
                final WebView w = new WebView(app);
                final Runnable finish = new Runnable() {
                    public void run() {
                        if (!finished.compareAndSet(false, true)) return;
                        try { w.destroy(); } catch (Exception e) { /* ignore */ }
                        pr.finish();
                    }
                };
                WebSettings s = w.getSettings();
                s.setJavaScriptEnabled(true);
                s.setDomStorageEnabled(true);
                s.setAllowFileAccess(true);
                w.addJavascriptInterface(new Object() {
                    @JavascriptInterface public void schedule(String json) { Scheduler.schedule(app, json); }
                    @JavascriptInterface public void saveTimes(String json) { Scheduler.saveTimes(app, json); }
                    @JavascriptInterface public void done() { h.post(finish); }
                }, "AndroidBridge");
                w.loadUrl(url);
                h.postDelayed(finish, 8000);
            }
        });
    }

    static Location bestLocation(Context c) {
        try {
            if (c.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                && c.checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return null;
            LocationManager lm = (LocationManager) c.getSystemService(Context.LOCATION_SERVICE);
            Location best = null;
            for (String p : lm.getProviders(true)) {
                Location l = lm.getLastKnownLocation(p);
                if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
            }
            return best;
        } catch (Exception e) {
            return null;
        }
    }
}
