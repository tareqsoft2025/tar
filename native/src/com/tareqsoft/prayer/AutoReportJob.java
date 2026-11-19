package com.tareqsoft.prayer;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import org.json.JSONObject;

/** يشغّل www/hr-auto.html في WebView خفي: مزامنة حديثة ثم بناء ملف Excel وتسليمه إلى AutoReport.deliver. */
public class AutoReportJob extends JobService {
    private WebView web;
    private final Handler h = new Handler(Looper.getMainLooper());

    @Override
    public boolean onStartJob(final JobParameters params) {
        if (!ErpClient.hasSession(this) && !ErpClient.hasCreds(this)) { AutoReport.status(this, false, "غير مسجَّل الدخول"); return false; }
        h.post(new Runnable() { public void run() {
            final boolean[] done = { false };
            final Runnable finish = new Runnable() { public void run() {
                if (done[0]) return; done[0] = true;
                try { if (web != null) web.destroy(); } catch (Exception e) { /* ignore */ }
                web = null; jobFinished(params, false);
            } };
            web = new WebView(getApplicationContext());
            WebSettings s = web.getSettings();
            s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setAllowFileAccess(true);
            web.addJavascriptInterface(new Object() {
                @JavascriptInterface public void erpGet(final String id, final String path) {
                    new Thread(new Runnable() { public void run() {
                        final ErpClient.Res r = ErpClient.get(AutoReportJob.this, path);
                        h.post(new Runnable() { public void run() {
                            if (web != null) web.evaluateJavascript("window.__erp&&window.__erp(" + JSONObject.quote(id) + "," + r.status + "," + JSONObject.quote(r.body) + ")", null);
                        } });
                    } }).start();
                }
                @JavascriptInterface public boolean erpSession() { return ErpClient.hasSession(AutoReportJob.this); }
                @JavascriptInterface public String netInfo() { return ErpClient.netInfo(AutoReportJob.this); }
                @JavascriptInterface public boolean hrPut(String name, String data) { try { ErpClient.put(AutoReportJob.this, name, data); return true; } catch (Exception e) { return false; } }
                @JavascriptInterface public String hrGet(String name) { return ErpClient.read(AutoReportJob.this, name); }
                @JavascriptInterface public String autoReportConfig() { return AutoReport.get(AutoReportJob.this); }
                @JavascriptInterface public void autoReportDone(final boolean ok, final String b64, final String name, final String msg, final double stamp) {
                    if (ok) AutoReport.deliver(AutoReportJob.this, b64, name, msg, (long) stamp); else AutoReport.status(AutoReportJob.this, false, "فشل بناء الملف: " + msg);
                    h.post(finish);
                }
            }, "AndroidBridge");
            web.loadUrl("file:///android_asset/www/hr-auto.html");
            h.postDelayed(finish, 8 * 60_000L);
        } });
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        h.post(new Runnable() { public void run() { try { if (web != null) web.destroy(); } catch (Exception e) { /* ignore */ } web = null; } });
        return true;
    }
}
