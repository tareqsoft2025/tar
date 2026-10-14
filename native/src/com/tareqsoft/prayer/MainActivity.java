package com.tareqsoft.prayer;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.drawable.Icon;
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
import android.view.View;
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
        web = new WebView(this);
        setContentView(web);
        SharedPreferences tp = getSharedPreferences("prayer", MODE_PRIVATE);
        applyBars(tp.getString("bar_bg", "#0b1620"), tp.getString("bar_nav", "#101e2b"), tp.getBoolean("bar_light", false));
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
        maybeSendTest();
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
        maybeSendTest();
        js("window.nativePermsChanged && window.nativePermsChanged()");
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) checkUpdate();
        maybeSendTest();
    }

    /** Matches the system bars and WebView background to the chosen theme. */
    private void applyBars(String bg, String nav, boolean light) {
        try {
            int b = Color.parseColor(bg), n = Color.parseColor(nav);
            getWindow().setStatusBarColor(b);
            getWindow().setNavigationBarColor(n);
            web.setBackgroundColor(b);
            if (Build.VERSION.SDK_INT >= 23) {
                View d = getWindow().getDecorView();
                int f = d.getSystemUiVisibility();
                int lightFlags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | (Build.VERSION.SDK_INT >= 26 ? View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0);
                d.setSystemUiVisibility(light ? (f | lightFlags) : (f & ~lightFlags));
            }
        } catch (Exception e) { /* ignore bad colour */ }
    }

    /** One test notification per install, sent natively as soon as notifications are allowed. */
    private void maybeSendTest() {
        SharedPreferences sp = getSharedPreferences("prayer", MODE_PRIVATE);
        if (sp.getBoolean("test_sent", false) || !Scheduler.notificationsAllowed(this)) return;
        sp.edit().putBoolean("test_sent", true).apply();
        Scheduler.notifyNow(this, 900, "تم تثبيت التطبيق بنجاح", "هذا إشعار تجريبي: ستصلك تنبيهات الصلاة قبل موعدها وعند دخول الوقت. بارك الله فيك.");
        js("window.toast && window.toast('تم إرسال إشعار تجريبي')");
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
        public boolean canOverlay() { return OverlayService.canDraw(MainActivity.this); }

        /** Opens the system screen to allow "display over other apps" for this app. */
        @JavascriptInterface
        public void requestOverlay() {
            runOnUiThread(new Runnable() { public void run() {
                startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
            } });
        }

        @JavascriptInterface
        public void setOverlay(boolean on) { Scheduler.setOverlayEnabled(MainActivity.this, on); }

        @JavascriptInterface
        public boolean overlayEnabled() { return OverlayService.enabled(MainActivity.this); }

        @JavascriptInterface
        public void setCountdown(boolean on) { Scheduler.setCountdownEnabled(MainActivity.this, on); }

        @JavascriptInterface
        public void saveTimes(String json) { Scheduler.saveTimes(MainActivity.this, json); }

        /** Asks the launcher to pin the prayer widget (Android 8+). Returns false if unsupported. */
        @JavascriptInterface
        public boolean pinWidget() {
            if (Build.VERSION.SDK_INT < 26) return false;
            AppWidgetManager m = AppWidgetManager.getInstance(MainActivity.this);
            if (!m.isRequestPinAppWidgetSupported()) return false;
            return m.requestPinAppWidget(new ComponentName(MainActivity.this, PrayerWidget.class), null, null);
        }

        /** Asks the launcher to pin an app shortcut to the home screen (Android 8+). */
        @JavascriptInterface
        public boolean pinShortcut() {
            if (Build.VERSION.SDK_INT < 26) return false;
            ShortcutManager sm = (ShortcutManager) getSystemService(Context.SHORTCUT_SERVICE);
            if (sm == null || !sm.isRequestPinShortcutSupported()) return false;
            Intent open = new Intent(MainActivity.this, MainActivity.class);
            open.setAction(Intent.ACTION_MAIN);
            ShortcutInfo info = new ShortcutInfo.Builder(MainActivity.this, "prayer_home")
                .setShortLabel("مواقيت الصلاة")
                .setIcon(Icon.createWithResource(MainActivity.this, R.mipmap.ic_launcher))
                .setIntent(open).build();
            return sm.requestPinShortcut(info, null);
        }

        @JavascriptInterface
        public void setTheme(final String bg, final String nav, final boolean light) {
            getSharedPreferences("prayer", MODE_PRIVATE).edit()
                .putString("bar_bg", bg).putString("bar_nav", nav).putBoolean("bar_light", light).apply();
            runOnUiThread(new Runnable() { public void run() { applyBars(bg, nav, light); } });
        }

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
