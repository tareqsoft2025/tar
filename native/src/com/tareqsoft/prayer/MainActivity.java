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
    private String pendingTab;

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
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView v, String url) {
                checkUpdate();
                if (pendingTab != null) { openTab(pendingTab); pendingTab = null; }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                cb.invoke(origin, true, false);
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        pendingTab = getIntent().getStringExtra("tab");
        pendingInstall = getIntent().getBooleanExtra("install", false);
        UpdateChecker.arm(this);
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

    private void openTab(String tab) {
        js("window.openTab && window.openTab(" + JSONObject.quote(tab) + ")");
    }

    @Override
    protected void onNewIntent(Intent in) {
        super.onNewIntent(in);
        setIntent(in);
        String tab = in.getStringExtra("tab");
        if (tab != null && web != null) openTab(tab);
        if (in.getBooleanExtra("install", false)) { pendingInstall = true; if (web != null) checkUpdate(); }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) checkUpdate();
        maybeSendTest();
        poll.removeCallbacks(pollTick);
        poll.postDelayed(pollTick, POLL_MS);
    }

    @Override
    protected void onPause() {
        super.onPause();
        poll.removeCallbacks(pollTick);
    }

    /** While the app is on screen, look for a new version every few minutes so it appears without reopening. */
    private static final long POLL_MS = 10 * 60 * 1000L;
    private final android.os.Handler poll = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable pollTick = new Runnable() {
        public void run() { checkUpdate(); poll.postDelayed(this, POLL_MS); }
    };
    private volatile boolean pendingInstall = false;
    private volatile int latestCode = 0;

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

    private volatile boolean downloading = false;

    private int currentVersion() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode; }
        catch (Exception e) { return Integer.MAX_VALUE; }
    }

    private String titleOf(Uri u) {
        if (u == null) return "";
        try { return android.media.RingtoneManager.getRingtone(this, u).getTitle(this); } catch (Exception e) { return "مخصّص"; }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if ((req == 7001 || req == 7002) && res == RESULT_OK && data != null) {
            String kind = req == 7002 ? "fajr" : "adhan";
            Uri u = data.getParcelableExtra(android.media.RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
            if (u != null) {
                getSharedPreferences("prayer", MODE_PRIVATE).edit().putString("snd_" + kind, u.toString()).apply();
                js("window.onSoundPicked&&window.onSoundPicked('" + kind + "')");
            }
        }
    }

    private void js(final String code) {
        runOnUiThread(new Runnable() { public void run() { web.evaluateJavascript(code, null); } });
    }

    /** Asks the repo for the latest version; shows the blocking update screen when newer. */
    private void checkUpdate() {
        new Thread(new Runnable() {
            public void run() {
                try {
                    JSONObject o = UpdateChecker.latest(MainActivity.this);
                    if (o == null) return;
                    latestCode = o.getInt("versionCode");
                    boolean ready = UpdateChecker.ready(MainActivity.this, latestCode);
                    o.put("ready", ready);
                    js("window.showUpdate && window.showUpdate(JSON.parse(" + JSONObject.quote(o.toString()) + "))");
                    if (pendingInstall) { pendingInstall = false; downloadAndInstall(o.getString("apk")); }
                } catch (Exception e) { /* offline: keep using the app */ }
            }
        }).start();
    }

    private void downloadAndInstall(final String url) {
        if (downloading) return;
        if (!url.startsWith(UpdateChecker.APK_PREFIX)) { js("window.updateError && window.updateError('رابط غير موثوق')"); return; }
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            js("window.updateError && window.updateError('اسمح للتطبيق بتثبيت التحديثات ثم ارجع واضغط تحديث')");
            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
            return;
        }
        downloading = true;
        new Thread(new Runnable() {
            public void run() {
                try {
                    // نزّلناه مسبقاً في الخلفية؟ ثبّت فوراً بلا انتظار
                    if (!UpdateChecker.ready(MainActivity.this, latestCode)) {
                        UpdateChecker.download(MainActivity.this, url, latestCode, new UpdateChecker.Progress() {
                            public void on(int pct) { js("window.updateProgress && window.updateProgress(" + Math.min(pct, 99) + ")"); }
                        });
                    }
                    UpdateChecker.cancelNotification(MainActivity.this);
                    UpdateChecker.install(MainActivity.this);
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
        public void copy(final String text) {
            runOnUiThread(new Runnable() { public void run() {
                android.content.ClipboardManager cm = (android.content.ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(android.content.ClipData.newPlainText("text", text));
            } });
        }

        @JavascriptInterface
        public void share(final String text) {
            runOnUiThread(new Runnable() { public void run() {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(i, "مشاركة"));
            } });
        }

        @JavascriptInterface
        public boolean dndAllowed() { return Scheduler.dndAllowed(MainActivity.this); }

        @JavascriptInterface
        public void requestDnd() {
            runOnUiThread(new Runnable() { public void run() {
                try { startActivity(new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)); } catch (Exception e) { /* ignore */ }
            } });
        }

        @JavascriptInterface
        public void mosqueEnd() { Scheduler.mosque(MainActivity.this, false); }

        @JavascriptInterface
        public String soundTitle(String kind) { return titleOf(Scheduler.soundFor(MainActivity.this, kind)); }

        @JavascriptInterface
        public void pickSound(final String kind) {
            runOnUiThread(new Runnable() { public void run() {
                try {
                    Intent in = new Intent(android.media.RingtoneManager.ACTION_RINGTONE_PICKER);
                    in.putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_TYPE, android.media.RingtoneManager.TYPE_ALL);
                    in.putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, false);
                    in.putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false);
                    in.putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_TITLE, "fajr".equals(kind) ? "صوت أذان الفجر" : "صوت الأذان");
                    Uri cur = Scheduler.soundFor(MainActivity.this, kind);
                    if (cur != null) in.putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, cur);
                    startActivityForResult(in, "fajr".equals(kind) ? 7002 : 7001);
                } catch (Exception e) { /* ignore */ }
            } });
        }

        @JavascriptInterface
        public void clearSound(String kind) {
            getSharedPreferences("prayer", MODE_PRIVATE).edit().remove("snd_" + kind).apply();
        }

        /** Opens the maps app on a place (mosque directions). */
        @JavascriptInterface
        public void openMap(double lat, double lon, String name) {
            Uri geo = Uri.parse("geo:" + lat + "," + lon + "?q=" + lat + "," + lon + "(" + Uri.encode(name) + ")");
            try { startActivity(new Intent(Intent.ACTION_VIEW, geo)); }
            catch (Exception e) {
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/maps/search/?api=1&query=" + lat + "," + lon))); }
                catch (Exception e2) { /* no handler */ }
            }
        }

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
