package com.tareqsoft.prayer;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

/**
 * Client for the HR web system's "management directives" API (https://tarsof.top/hrnew/mgmt/api.php).
 * Logs in through the normal login form (session cookie + CSRF token), keeps the session, and re-logs in with
 * the encrypted saved credentials when it expires. Only this host is contacted.
 */
final class MgmtClient {
    static final String BASE = "https://tarsof.top";
    private static final String PREFS = "mgmt";
    private static final String API = "/hrnew/mgmt/api.php";

    private MgmtClient() {}

    private static SharedPreferences sp(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private static synchronized Map<String, String> cookies(Context c) {
        Map<String, String> m = new TreeMap<String, String>();
        try {
            JSONObject o = new JSONObject(sp(c).getString("cookies", "{}"));
            java.util.Iterator<String> it = o.keys();
            while (it.hasNext()) { String k = it.next(); m.put(k, o.getString(k)); }
        } catch (Exception e) { /* empty */ }
        return m;
    }

    private static synchronized void storeCookies(Context c, HttpURLConnection con) {
        Map<String, List<String>> h = con.getHeaderFields();
        if (h == null) return;
        Map<String, String> m = cookies(c);
        boolean changed = false;
        for (Map.Entry<String, List<String>> e : h.entrySet()) {
            if (e.getKey() == null || !e.getKey().equalsIgnoreCase("Set-Cookie")) continue;
            for (String v : e.getValue()) {
                String pair = v.split(";", 2)[0];
                int i = pair.indexOf('=');
                if (i <= 0) continue;
                String name = pair.substring(0, i).trim(), val = pair.substring(i + 1).trim();
                String low = v.toLowerCase();
                boolean expired = low.contains("max-age=0") || low.contains("expires=thu, 01 jan 1970");
                if (expired || val.isEmpty() || val.equalsIgnoreCase("deleted")) m.remove(name); else m.put(name, val);
                changed = true;
            }
        }
        if (changed) sp(c).edit().putString("cookies", new JSONObject(m).toString()).apply();
    }

    private static String cookieHeader(Context c) {
        StringBuilder b = new StringBuilder();
        for (Map.Entry<String, String> e : cookies(c).entrySet()) {
            if (b.length() > 0) b.append("; ");
            b.append(e.getKey()).append('=').append(e.getValue());
        }
        return b.toString();
    }

    /** Raw result incl. redirect target. */
    static final class Raw {
        final int status; final String body; final String location;
        Raw(int s, String b, String l) { status = s; body = b; location = l; }
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] b = new byte[8192]; int n;
        while ((n = in.read(b)) > 0) o.write(b, 0, n);
        return o.toByteArray();
    }

    private static Raw http(Context c, String method, String path, String body, String contentType, boolean api) {
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(BASE + path).openConnection();
            con.setRequestMethod(method);
            con.setConnectTimeout(25000);
            con.setReadTimeout(120000);
            con.setUseCaches(false);
            con.setInstanceFollowRedirects(false);
            con.setRequestProperty("Accept", api ? "application/json" : "text/html");
            con.setRequestProperty("Accept-Language", "ar");
            con.setRequestProperty("Origin", BASE);
            con.setRequestProperty("Referer", BASE + "/hrnew/");
            if (api) con.setRequestProperty("X-Requested-With", "tarsof-app");
            String ck = cookieHeader(c);
            if (!ck.isEmpty()) con.setRequestProperty("Cookie", ck);
            if (body != null) {
                con.setDoOutput(true);
                con.setRequestProperty("Content-Type", contentType);
                OutputStream o = con.getOutputStream();
                o.write(body.getBytes("UTF-8"));
                o.close();
            }
            int code = con.getResponseCode();
            storeCookies(c, con);
            InputStream in = code >= 400 ? con.getErrorStream() : con.getInputStream();
            String text = in == null ? "" : new String(readAll(in), "UTF-8");
            return new Raw(code, text, con.getHeaderField("Location"));
        } catch (Exception e) {
            return new Raw(0, "{\"ok\":false,\"error\":\"network\"}", null);
        } finally { if (con != null) con.disconnect(); }
    }

    private static final Pattern CSRF = Pattern.compile("name=\"csrf_token\"\\s+value=\"([^\"]+)\"");

    /** Form login. 200 on success; 401 for wrong credentials; 0 for network trouble. */
    static ErpClient.Res login(Context c, String user, String pass) {
        sp(c).edit().remove("cookies").apply();
        Raw page = http(c, "GET", "/hrnew/login.php", null, null, false);
        if (page.status == 0) return new ErpClient.Res(0, "{\"ok\":false,\"error\":\"network\"}");
        Matcher m = CSRF.matcher(page.body);
        if (!m.find()) return new ErpClient.Res(502, "{\"ok\":false,\"error\":\"login_page\"}");
        try {
            String form = "csrf_token=" + URLEncoder.encode(m.group(1), "UTF-8") + "&username=" + URLEncoder.encode(user, "UTF-8") + "&password=" + URLEncoder.encode(pass, "UTF-8");
            Raw r = http(c, "POST", "/hrnew/login.php", form, "application/x-www-form-urlencoded", false);
            if (r.status == 0) return new ErpClient.Res(0, "{\"ok\":false,\"error\":\"network\"}");
            boolean redirected = r.status / 100 == 3 && r.location != null && !r.location.contains("login.php");
            if (!redirected) return new ErpClient.Res(401, "{\"ok\":false,\"error\":\"invalid_credentials\"}");
            sp(c).edit().putString("user", user).apply();
            return new ErpClient.Res(200, "{\"ok\":true}");
        } catch (Exception e) { return new ErpClient.Res(0, "{\"ok\":false,\"error\":\"client\"}"); }
    }

    private static boolean transient_(Raw r) { return r.status == 0 || r.status == 502 || r.status == 503 || r.status == 504; }
    private static boolean unauth(Raw r) { return r.status == 401 || (r.status / 100 == 3 && r.location != null && r.location.contains("login")); }

    /** API call: GET with retries on a weak link; POST once. Re-logs in with saved credentials when the session is gone. */
    static ErpClient.Res call(Context c, String method, String query, String json) {
        String path = API + (query == null || query.isEmpty() ? "" : "?" + query);
        boolean get = "GET".equals(method);
        Raw r = send(c, method, path, json, get);
        if (unauth(r)) {
            String[] cr = loadCreds(c);
            if (cr != null && login(c, cr[0], cr[1]).status == 200) r = send(c, method, path, json, get);
        }
        int st = unauth(r) ? 401 : r.status;
        return new ErpClient.Res(st, r.body);
    }

    private static Raw send(Context c, String method, String path, String json, boolean retry) {
        Raw r = http(c, method, path, json, "application/json", true);
        long[] wait = { 1500, 4000, 9000 };
        for (int i = 0; retry && i < wait.length && transient_(r); i++) {
            try { Thread.sleep(wait[i]); } catch (InterruptedException e) { break; }
            r = http(c, method, path, json, "application/json", true);
        }
        return r;
    }

    static boolean hasSession(Context c) { return !cookies(c).isEmpty(); }

    static void logout(Context c) { sp(c).edit().clear().apply(); }

    /* ---------- بيانات الدخول مشفّرة بمفتاح مخزن مفاتيح أندرويد ---------- */
    private static final String KEY_ALIAS = "pef_mgmt_creds";

    private static javax.crypto.SecretKey key() throws Exception {
        java.security.KeyStore ks = java.security.KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (!ks.containsAlias(KEY_ALIAS)) {
            javax.crypto.KeyGenerator kg = javax.crypto.KeyGenerator.getInstance("AES", "AndroidKeyStore");
            kg.init(new android.security.keystore.KeyGenParameterSpec.Builder(KEY_ALIAS,
                android.security.keystore.KeyProperties.PURPOSE_ENCRYPT | android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
            kg.generateKey();
        }
        return (javax.crypto.SecretKey) ks.getKey(KEY_ALIAS, null);
    }

    static boolean saveCreds(Context c, String user, String pass) {
        try {
            javax.crypto.Cipher ci = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");
            ci.init(javax.crypto.Cipher.ENCRYPT_MODE, key());
            JSONObject o = new JSONObject(); o.put("u", user); o.put("p", pass);
            byte[] enc = ci.doFinal(o.toString().getBytes("UTF-8"));
            sp(c).edit().putString("cr", android.util.Base64.encodeToString(enc, android.util.Base64.NO_WRAP))
                .putString("iv", android.util.Base64.encodeToString(ci.getIV(), android.util.Base64.NO_WRAP)).apply();
            return true;
        } catch (Exception e) { return false; }
    }

    static String[] loadCreds(Context c) {
        try {
            String cr = sp(c).getString("cr", null), iv = sp(c).getString("iv", null);
            if (cr == null || iv == null) return null;
            javax.crypto.Cipher ci = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");
            ci.init(javax.crypto.Cipher.DECRYPT_MODE, key(), new javax.crypto.spec.GCMParameterSpec(128, android.util.Base64.decode(iv, android.util.Base64.NO_WRAP)));
            JSONObject o = new JSONObject(new String(ci.doFinal(android.util.Base64.decode(cr, android.util.Base64.NO_WRAP)), "UTF-8"));
            return new String[] { o.getString("u"), o.getString("p") };
        } catch (Exception e) { return null; }
    }

    static boolean hasCreds(Context c) { return sp(c).contains("cr"); }
    static void forgetCreds(Context c) { sp(c).edit().remove("cr").remove("iv").apply(); }
}
