package com.tareqsoft.prayer;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
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
    private WebView web;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setStatusBarColor(Color.parseColor("#06231a"));
        getWindow().setNavigationBarColor(Color.parseColor("#0a2a1f"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#06231a"));
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setGeolocationEnabled(true);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView v, String url) { checkUpdate(); }
        });
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

    /** Asks once (first launch only): location + notifications, then background location. Never nags again. */
    private void requestPerms() {
        if (Build.VERSION.SDK_INT < 23) return;
        SharedPreferences sp = getSharedPreferences("prayer", MODE_PRIVATE);
        if (sp.getBoolean("perms_asked", false)) return;
        sp.edit().putBoolean("perms_asked", true).apply();
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
        SharedPreferences sp = getSharedPreferences("prayer", MODE_PRIVATE);
        if (code == 1 && Build.VERSION.SDK_INT >= 29 && !sp.getBoolean("bg_asked", false)
            && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            sp.edit().putBoolean("bg_asked", true).apply();
            requestPermissions(new String[] { "android.permission.ACCESS_BACKGROUND_LOCATION" }, 2);
        }
        js("window.nativePermsChanged && window.nativePermsChanged()");
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) checkUpdate();
    }

    private static final String VERSION_URL = "https://raw.githubusercontent.com/tareqsoft2025/tar/main/dist/version.json";
    private static final String APK_PREFIX = "https://raw.githubusercontent.com/tareqsoft2025/tar/";
    private volatile boolean downloading = false;

    private int currentVersion() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode; }
        catch (Exception e) { return Integer.MAX_VALUE; }
    }

    private void js(final String code) {
        runOnUiThread(new Runnable() { public void run() { web.evaluateJavascript(code, null); } });
    }

    /** Asks the repo for the latest version; shows the blocking update screen when newer. */
    private void checkUpdate() {
        new Thread(new Runnable() {
            public void run() {
                try {
                    String json = new String(readAll(open(VERSION_URL, 8000)), "UTF-8");
                    JSONObject o = new JSONObject(json);
                    if (o.getInt("versionCode") > currentVersion())
                        js("window.showUpdate && window.showUpdate(JSON.parse(" + JSONObject.quote(json) + "))");
                } catch (Exception e) { /* offline: keep using the app */ }
            }
        }).start();
    }

    private static HttpURLConnection open(String url, int timeout) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url + (url.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis()).openConnection();
        c.setConnectTimeout(timeout);
        c.setReadTimeout(timeout * 3);
        c.setUseCaches(false);
        return c;
    }

    private static byte[] readAll(HttpURLConnection c) throws Exception {
        InputStream in = c.getInputStream();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toByteArray();
    }

    private void downloadAndInstall(final String url) {
        if (downloading) return;
        if (!url.startsWith(APK_PREFIX)) { js("window.updateError && window.updateError('رابط غير موثوق')"); return; }
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            js("window.updateError && window.updateError('اسمح للتطبيق بتثبيت التحديثات ثم ارجع واضغط تحديث')");
            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
            return;
        }
        downloading = true;
        new Thread(new Runnable() {
            public void run() {
                try {
                    HttpURLConnection c = open(url, 15000);
                    int total = c.getContentLength();
                    InputStream in = c.getInputStream();
                    File f = UpdateProvider.apk(MainActivity.this);
                    FileOutputStream out = new FileOutputStream(f);
                    byte[] buf = new byte[16384];
                    long done = 0;
                    int n, last = -1;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : 0;
                        if (pct != last) { last = pct; js("window.updateProgress && window.updateProgress(" + pct + ")"); }
                    }
                    out.close();
                    in.close();
                    Intent i = new Intent(Intent.ACTION_VIEW);
                    i.setDataAndType(Uri.parse("content://com.tareqsoft.prayer.update/update.apk"), "application/vnd.android.package-archive");
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(i);
                    js("window.updateProgress && window.updateProgress(100)");
                } catch (Exception e) {
                    js("window.updateError && window.updateError('فشل التنزيل، تحقق من الإنترنت وحاول مجدداً')");
                } finally { downloading = false; }
            }
        }).start();
    }

    @Override
    public void onBackPressed() { moveTaskToBack(true); }

    class Bridge {
        @JavascriptInterface
        public void startUpdate(String url) { downloadAndInstall(url); }

        @JavascriptInterface
        public int versionCode() { return currentVersion(); }

        /** json: [{"at":epochMillis,"title":"..","body":".."}, ...] */
        @JavascriptInterface
        public void schedule(String json) {
            Scheduler.schedule(MainActivity.this, json);
            Scheduler.armRefresh(MainActivity.this, 6L * 60 * 60 * 1000);
        }

        @JavascriptInterface
        public void cancel() { Scheduler.cancelAll(MainActivity.this); }

        @JavascriptInterface
        public boolean notificationsAllowed() { return Scheduler.notificationsAllowed(MainActivity.this); }

        @JavascriptInterface
        public void testNotification() {
            Scheduler.notifyNow(MainActivity.this, 900, "تم تفعيل التنبيهات بنجاح",
                "ستصلك تنبيهات الصلاة قبل موعدها وعند دخول الوقت. بارك الله فيك.");
        }

        @JavascriptInterface
        public boolean exactAlarmsAllowed() {
            if (Build.VERSION.SDK_INT < 31) return true;
            return ((AlarmManager) getSystemService(Context.ALARM_SERVICE)).canScheduleExactAlarms();
        }
    }
}
