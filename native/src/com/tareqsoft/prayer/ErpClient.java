package com.tareqsoft.prayer;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.json.JSONObject;

/**
 * Talks to the PEF ERP system natively (the WebView page cannot: the site blocks other origins and keeps
 * its session in httpOnly cookies). Only this host is ever contacted; the password is never stored.
 */
final class ErpClient {
    static final String BASE = "https://www.pef-erp-system.org";
    private static final String PREFS = "erp";

    private ErpClient() {}

    static final class Res {
        final int status; final String body;
        Res(int s, String b) { status = s; body = b; }
    }

    private static SharedPreferences sp(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** Cookies are kept as name=value pairs, updated from every Set-Cookie header. */
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
                boolean expired = v.toLowerCase().contains("max-age=0") || v.toLowerCase().contains("expires=thu, 01 jan 1970");
                if (expired || val.isEmpty()) m.remove(name); else m.put(name, val);
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

    static Res request(Context c, String method, String path, String json) {
        if (!path.startsWith("/api/")) return new Res(400, "{\"error\":\"bad_path\"}");
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(BASE + path).openConnection();
            con.setRequestMethod(method);
            con.setConnectTimeout(15000);
            con.setReadTimeout(60000);
            con.setUseCaches(false);
            con.setInstanceFollowRedirects(false);
            con.setRequestProperty("Accept", "application/json");
            con.setRequestProperty("Accept-Language", "ar");
            con.setRequestProperty("Origin", BASE);
            con.setRequestProperty("Referer", BASE + "/");
            String ck = cookieHeader(c);
            if (!ck.isEmpty()) con.setRequestProperty("Cookie", ck);
            if (json != null) {
                con.setDoOutput(true);
                con.setRequestProperty("Content-Type", "application/json");
                OutputStream o = con.getOutputStream();
                o.write(json.getBytes("UTF-8"));
                o.close();
            }
            int code = con.getResponseCode();
            storeCookies(c, con);
            InputStream in = code >= 400 ? con.getErrorStream() : con.getInputStream();
            String body = in == null ? "" : new String(readAll(in), "UTF-8");
            return new Res(code, body);
        } catch (Exception e) {
            return new Res(0, "{\"error\":\"network\",\"message\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}");
        } finally { if (con != null) con.disconnect(); }
    }

    /** GET with one automatic session refresh on 401. */
    static Res get(Context c, String path) {
        Res r = request(c, "GET", path, null);
        if (r.status == 401) {
            Res f = request(c, "POST", "/api/auth/refresh", "{}");
            if (f.status >= 200 && f.status < 300) r = request(c, "GET", path, null);
            if (r.status == 401) {
                String[] cr = loadCreds(c);
                if (cr != null && login(c, cr[0], cr[1], true).status / 100 == 2) r = request(c, "GET", path, null);
            }
        }
        return r;
    }

    static Res login(Context c, String user, String pass) { return login(c, user, pass, false); }

    static Res login(Context c, String user, String pass, boolean keepCreds) {
        sp(c).edit().remove("cookies").apply();
        try {
            JSONObject b = new JSONObject();
            b.put("username", user);
            b.put("password", pass);
            b.put("rememberMe", true);
            Res r = request(c, "POST", "/api/auth/login", b.toString());
            if (r.status >= 200 && r.status < 300) sp(c).edit().putString("user", user).apply();
            else if (!keepCreds && (r.status == 401 || r.status == 403)) forgetCreds(c);
            return r;
        } catch (Exception e) { return new Res(0, "{\"error\":\"client\"}"); }
    }

    /* ---------- حفظ بيانات الدخول مشفّرة بمفتاح من مخزن مفاتيح أندرويد ---------- */
    private static final String KEY_ALIAS = "pef_erp_creds";

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

    static void logout(Context c) {
        try { request(c, "POST", "/api/auth/logout", "{}"); } catch (Exception e) { /* ignore */ }
        sp(c).edit().clear().apply();
    }

    static boolean hasSession(Context c) { return !cookies(c).isEmpty(); }

    /* ---------- تخزين بيانات الموارد البشرية في ملفات خاصة بالتطبيق ---------- */
    private static File dir(Context c) { File d = new File(c.getFilesDir(), "hr"); d.mkdirs(); return d; }
    private static String safe(String name) { return name.replaceAll("[^A-Za-z0-9_\\-]", "_"); }

    static void put(Context c, String name, String data) throws Exception {
        File tmp = new File(dir(c), safe(name) + ".tmp");
        FileOutputStream o = new FileOutputStream(tmp);
        o.write(data.getBytes("UTF-8"));
        o.close();
        File f = new File(dir(c), safe(name) + ".json");
        if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f); }
    }

    static String read(Context c, String name) {
        File f = new File(dir(c), safe(name) + ".json");
        if (!f.exists()) return null;
        try { return new String(readAll(new FileInputStream(f)), "UTF-8"); } catch (Exception e) { return null; }
    }

    static void wipe(Context c) {
        File[] fs = dir(c).listFiles();
        if (fs != null) for (File f : fs) f.delete();
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toByteArray();
    }
}
