package com.tareqsoft.prayer;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.telephony.SmsManager;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Sends text messages straight from the app (SmsManager) after the user confirmed the batch in the UI.
 * One message at a time with a short pause, results tracked per message id in SharedPreferences "sms".
 */
final class SmsSender {
    static final String ACTION = "com.tareqsoft.prayer.SMS_SENT";
    private static final String PREFS = "sms";
    private static final ExecutorService POOL = Executors.newSingleThreadExecutor();

    private SmsSender() {}

    private static SharedPreferences sp(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static boolean available(Context c) { return c.getPackageManager().hasSystemFeature(PackageManager.FEATURE_TELEPHONY); }

    static boolean can(Context c) {
        return available(c) && (Build.VERSION.SDK_INT < 23 || c.checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED);
    }

    /** SIM cards: [{id, name, slot, def}] (empty when only one/unknown or READ_PHONE_STATE not granted). */
    static String sims(Context c) {
        JSONArray a = new JSONArray();
        try {
            if (Build.VERSION.SDK_INT >= 22 && (Build.VERSION.SDK_INT < 23 || c.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED)) {
                SubscriptionManager sm = (SubscriptionManager) c.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE);
                List<SubscriptionInfo> l = sm == null ? null : sm.getActiveSubscriptionInfoList();
                int def = SmsManager.getDefaultSmsSubscriptionId();
                if (l != null) for (SubscriptionInfo i : l) {
                    JSONObject o = new JSONObject();
                    o.put("id", i.getSubscriptionId());
                    CharSequence dn = i.getDisplayName(), cr = i.getCarrierName();
                    o.put("name", String.valueOf(dn != null ? dn : cr != null ? cr : "SIM"));
                    o.put("slot", i.getSimSlotIndex() + 1);
                    o.put("def", i.getSubscriptionId() == def);
                    a.put(o);
                }
            }
        } catch (Exception e) { /* none */ }
        return a.toString();
    }

    /** json: {"sim": subscriptionId or -1, "items": [{"id": int, "to": "...", "body": "..."}]} — runs in the background. */
    static void send(final Context c, final String json) {
        POOL.execute(new Runnable() { public void run() {
            try {
                JSONObject o = new JSONObject(json);
                int sim = o.optInt("sim", -1);
                JSONArray items = o.getJSONArray("items");
                SharedPreferences.Editor e = sp(c).edit();
                for (int i = 0; i < items.length(); i++) e.putString("s_" + items.getJSONObject(i).getInt("id"), "queued");
                e.commit();
                for (int i = 0; i < items.length(); i++) {
                    JSONObject it = items.getJSONObject(i);
                    sendOne(c, sim, it.getInt("id"), it.getString("to"), it.getString("body"));
                    try { Thread.sleep(1200); } catch (InterruptedException ie) { return; }
                }
            } catch (Exception ex) { /* statuses stay queued/failed per item */ }
        } });
    }

    private static void sendOne(Context c, int sim, int id, String to, String body) {
        SharedPreferences sp = sp(c);
        try {
            SmsManager sm = (sim >= 0 && Build.VERSION.SDK_INT >= 22) ? SmsManager.getSmsManagerForSubscriptionId(sim) : SmsManager.getDefault();
            ArrayList<String> parts = sm.divideMessage(body);
            ArrayList<PendingIntent> sents = new ArrayList<PendingIntent>();
            int flags = (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0) | PendingIntent.FLAG_UPDATE_CURRENT;
            for (int i = 0; i < parts.size(); i++) {
                Intent in = new Intent(c, SmsStatusReceiver.class).setAction(ACTION).putExtra("id", id).putExtra("total", parts.size());
                sents.add(PendingIntent.getBroadcast(c, id * 32 + i, in, flags));
            }
            sp.edit().putInt("t_" + id, parts.size()).putInt("o_" + id, 0).putString("s_" + id, "sending").commit();
            if (parts.size() == 1) sm.sendTextMessage(to, null, parts.get(0), sents.get(0), null);
            else sm.sendMultipartTextMessage(to, null, parts, sents, null);
        } catch (Exception e) {
            sp.edit().putString("s_" + id, "failed:" + (e instanceof SecurityException ? "perm" : "exc")).commit();
        }
    }

    /** Called by SmsStatusReceiver for every message part. resultCode -1 (RESULT_OK) = handed to the network. */
    static synchronized void record(Context c, int id, int total, int resultCode) {
        SharedPreferences sp = sp(c);
        String cur = sp.getString("s_" + id, "");
        if (cur.startsWith("failed")) return;
        if (resultCode != android.app.Activity.RESULT_OK) { sp.edit().putString("s_" + id, "failed:" + resultCode).commit(); return; }
        int ok = sp.getInt("o_" + id, 0) + 1;
        SharedPreferences.Editor e = sp.edit().putInt("o_" + id, ok);
        if (ok >= total) e.putString("s_" + id, "sent");
        e.commit();
    }

    /** ids: JSON array of ints → {"12":"sent","13":"failed:4",...} */
    static String status(Context c, String idsJson) {
        JSONObject o = new JSONObject();
        try {
            JSONArray ids = new JSONArray(idsJson);
            SharedPreferences sp = sp(c);
            for (int i = 0; i < ids.length(); i++) { int id = ids.getInt(i); o.put(String.valueOf(id), sp.getString("s_" + id, "unknown")); }
        } catch (Exception e) { /* empty */ }
        return o.toString();
    }
}
