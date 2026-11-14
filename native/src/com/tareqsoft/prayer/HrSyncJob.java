package com.tareqsoft.prayer;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import org.json.JSONObject;

/**
 * Background HR sync: a periodic job (only with network) that runs the same sync code as the app
 * (www/hr-sync.html) inside a hidden WebView, so data stays fresh without opening the app.
 */
public class HrSyncJob extends JobService {
    private static final int JOB_ID = 7311;
    private WebView web;
    private final Handler h = new Handler(Looper.getMainLooper());

    static void arm(Context c, int minutes) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (minutes <= 0) { js.cancel(JOB_ID); return; }
        long period = Math.max(15, minutes) * 60_000L;
        js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, HrSyncJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(period)
            .setPersisted(true)
            .build());
    }

    @Override
    public boolean onStartJob(final JobParameters params) {
        if (!ErpClient.hasSession(this) && !ErpClient.hasCreds(this)) return false;
        h.post(new Runnable() { public void run() {
            final Runnable finish = new Runnable() {
                boolean done = false;
                public void run() {
                    if (done) return; done = true;
                    try { if (web != null) web.destroy(); } catch (Exception e) { /* ignore */ }
                    web = null;
                    jobFinished(params, false);
                }
            };
            web = new WebView(getApplicationContext());
            WebSettings s = web.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setAllowFileAccess(true);
            web.addJavascriptInterface(new Object() {
                @JavascriptInterface public void erpGet(final String id, final String path) {
                    new Thread(new Runnable() { public void run() {
                        final ErpClient.Res r = ErpClient.get(HrSyncJob.this, path);
                        h.post(new Runnable() { public void run() {
                            if (web != null) web.evaluateJavascript("window.__erp&&window.__erp(" + JSONObject.quote(id) + "," + r.status + "," + JSONObject.quote(r.body) + ")", null);
                        } });
                    } }).start();
                }
                @JavascriptInterface public boolean erpSession() { return ErpClient.hasSession(HrSyncJob.this); }
                @JavascriptInterface public String netInfo() { return ErpClient.netInfo(HrSyncJob.this); }
                @JavascriptInterface public boolean hrPut(String name, String data) { try { ErpClient.put(HrSyncJob.this, name, data); return true; } catch (Exception e) { return false; } }
                @JavascriptInterface public String hrGet(String name) { return ErpClient.read(HrSyncJob.this, name); }
                @JavascriptInterface public void attAlert(String data, String title, String body) { ReminderActivity.fireAtt(getApplicationContext(), data, title, body); }
                @JavascriptInterface public void done() { h.post(finish); }
            }, "AndroidBridge");
            web.loadUrl("file:///android_asset/www/hr-sync.html");
            h.postDelayed(finish, 9 * 60_000L);
        } });
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        h.post(new Runnable() { public void run() { try { if (web != null) web.destroy(); } catch (Exception e) { /* ignore */ } web = null; } });
        return true;
    }
}
