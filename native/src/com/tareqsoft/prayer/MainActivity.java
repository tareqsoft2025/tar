package com.tareqsoft.prayer;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int MAX_ALARMS = 60;
    private WebView web;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setStatusBarColor(Color.parseColor("#0b3d2e"));
        getWindow().setNavigationBarColor(Color.parseColor("#082b20"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0b3d2e"));
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setGeolocationEnabled(true);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                cb.invoke(origin, true, false);
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        requestPerms();
        web.loadUrl("file:///android_asset/www/index.html");
    }

    private void requestPerms() {
        if (Build.VERSION.SDK_INT < 23) return;
        java.util.ArrayList<String> need = new java.util.ArrayList<String>();
        need.add(Manifest.permission.ACCESS_FINE_LOCATION);
        need.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        if (Build.VERSION.SDK_INT >= 33) need.add("android.permission.POST_NOTIFICATIONS");
        java.util.ArrayList<String> missing = new java.util.ArrayList<String>();
        for (String p : need) if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
        if (!missing.isEmpty()) requestPermissions(missing.toArray(new String[0]), 1);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        web.post(new Runnable() { public void run() { web.reload(); } });
    }

    @Override
    public void onBackPressed() { moveTaskToBack(true); }

    class Bridge {
        /** json: [{"at":epochMillis,"title":"..","body":".."}, ...] */
        @JavascriptInterface
        public void schedule(String json) {
            try {
                AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                cancelAll(am);
                JSONArray arr = new JSONArray(json);
                long now = System.currentTimeMillis();
                int n = 0;
                for (int i = 0; i < arr.length() && n < MAX_ALARMS; i++) {
                    JSONObject o = arr.getJSONObject(i);
                    long at = o.getLong("at");
                    if (at <= now) continue;
                    Intent in = new Intent(MainActivity.this, AlarmReceiver.class);
                    in.putExtra("title", o.optString("title"));
                    in.putExtra("body", o.optString("body"));
                    in.putExtra("id", n);
                    PendingIntent pi = PendingIntent.getBroadcast(MainActivity.this, n, in, flags());
                    if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                    else am.set(AlarmManager.RTC_WAKEUP, at, pi);
                    n++;
                }
            } catch (Exception e) { /* ignore */ }
        }

        @JavascriptInterface
        public void cancel() {
            cancelAll((AlarmManager) getSystemService(Context.ALARM_SERVICE));
        }

        private void cancelAll(AlarmManager am) {
            for (int i = 0; i < MAX_ALARMS; i++) {
                Intent in = new Intent(MainActivity.this, AlarmReceiver.class);
                PendingIntent pi = PendingIntent.getBroadcast(MainActivity.this, i, in, flags());
                am.cancel(pi);
            }
        }

        private int flags() {
            return Build.VERSION.SDK_INT >= 23
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;
        }
    }
}
