package com.tareqsoft.prayer;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * إرسال التقرير بالبريد عبر SMTP مباشرة (بدون مكتبات): منفذ 465 (SSL) أو 587 (STARTTLS)، تسجيل دخول AUTH LOGIN،
 * رسالة MIME بنص UTF-8 ومرفق Excel. كلمة المرور تُحفظ مشفّرة بمفتاح مخزن أندرويد. (Gmail: كلمة مرور تطبيق من حساب Google.)
 */
public class MailSender {
    static final String PREFS = "mailcfg";
    static SharedPreferences sp(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** الإعدادات للواجهة (بلا كلمة المرور): {on,host,port,user,from,to:[..],hasPass}. */
    static String get(Context c) {
        try {
            JSONObject o = new JSONObject(sp(c).getString("cfg", "{}"));
            o.put("hasPass", !sp(c).getString("pw", "").isEmpty());
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }

    /** json: الحقول أعلاه + pass (اختياري: إن وُجد استُبدلت كلمة المرور). */
    static void set(Context c, String json) {
        try {
            JSONObject o = new JSONObject(json);
            String pass = o.optString("pass", "");
            o.remove("pass");
            SharedPreferences.Editor e = sp(c).edit().putString("cfg", o.toString());
            if (!pass.isEmpty()) e.putString("pw", ErpClient.encText(pass));
            e.apply();
            MailCheckJob.arm(c);
        } catch (Exception e) { /* ignore */ }
    }

    /** إشعار البريد الجديد مفعّل وفيه بيانات الحساب. */
    static boolean notifyEnabled(Context c) {
        try { JSONObject o = new JSONObject(sp(c).getString("cfg", "{}")); return o.optBoolean("notify", false) && !o.optString("imapHost", "").isEmpty() && !o.optString("user", "").isEmpty() && !sp(c).getString("pw", "").isEmpty(); }
        catch (Exception e) { return false; }
    }

    static boolean enabled(Context c) {
        try { JSONObject o = new JSONObject(sp(c).getString("cfg", "{}")); return o.optBoolean("on", false) && o.optJSONArray("to") != null && o.optJSONArray("to").length() > 0 && !sp(c).getString("pw", "").isEmpty(); }
        catch (Exception e) { return false; }
    }

    /** يرسل الرسالة؛ يعيد null عند النجاح أو نص الخطأ. يُستدعى من خيط خلفي. */
    static String send(Context c, String subject, String body, String fileName, byte[] file) {
        try {
            JSONObject o = new JSONObject(sp(c).getString("cfg", "{}"));
            String host = o.optString("host", ""), user = o.optString("user", ""), from = o.optString("from", user), pass = ErpClient.decText(sp(c).getString("pw", ""));
            int port = o.optInt("port", 465);
            String sec = o.optString("sec", "auto");
            JSONArray to = o.optJSONArray("to");
            if (host.isEmpty() || user.isEmpty() || pass.isEmpty() || to == null || to.length() == 0) return "إعدادات البريد ناقصة";
            return smtp(host, port, sec, user, pass, from.isEmpty() ? user : from, to, subject, body, fileName, file);
        } catch (Exception e) { return "خطأ: " + e.getMessage(); }
    }

    private static String b64(byte[] d) { return android.util.Base64.encodeToString(d, android.util.Base64.NO_WRAP); }
    private static String enc(String s) { try { return "=?UTF-8?B?" + b64(s.getBytes("UTF-8")) + "?="; } catch (Exception e) { return s; } }

    private static String read(BufferedReader r) throws Exception {   // يقرأ ردّاً متعدد الأسطر ويعيد آخر سطر
        String l, last = "";
        while ((l = r.readLine()) != null) { last = l; if (l.length() < 4 || l.charAt(3) != '-') break; }
        return last;
    }
    /** يقرأ ردّاً متعدد الأسطر كاملاً ويتحقق من الرمز، ويعيده كنص (لقراءة القدرات). */
    static String readAll(BufferedReader r, String code, String what) throws Exception {
        StringBuilder sb = new StringBuilder(); String l;
        while ((l = r.readLine()) != null) { sb.append(l).append('\n'); if (l.length() < 4 || l.charAt(3) != '-') break; }
        if (!sb.toString().startsWith(code)) throw new Exception(what + ": " + sb);
        return sb.toString();
    }
    private static void cmd(OutputStream o, String s) throws Exception { o.write((s + "\r\n").getBytes("UTF-8")); o.flush(); }
    private static void expect(BufferedReader r, String code, String what) throws Exception {
        String l = read(r);
        if (!l.startsWith(code)) throw new Exception(what + ": " + l);
    }

    /** يرفع الاتصال إلى TLS ويتحقق من أن الشهادة تخص اسم الخادم (SSLSocket لا يتحقق من الاسم تلقائياً). */
    private static SSLSocket tls(SSLSocketFactory sf, Socket plain, String host, int port) throws Exception {
        SSLSocket ss = (SSLSocket) sf.createSocket(plain, host, port, true);
        ss.setUseClientMode(true);
        javax.net.ssl.SSLParameters sp = ss.getSSLParameters(); sp.setEndpointIdentificationAlgorithm("HTTPS"); ss.setSSLParameters(sp);   // تحقق اسم الخادم أثناء المصافحة
        ss.startHandshake();
        if (!javax.net.ssl.HttpsURLConnection.getDefaultHostnameVerifier().verify(host, ss.getSession())) throw new Exception("شهادة الخادم لا تطابق الاسم " + host);
        return ss;
    }

    private static String smtp(String host, int port, String sec, String user, String pass, String from, JSONArray to, String subject, String body, String fileName, byte[] file) {
        Socket sock = null;
        try {
            SSLSocketFactory sf = (SSLSocketFactory) SSLSocketFactory.getDefault();
            Socket plain = new Socket(); plain.connect(new InetSocketAddress(host, port), 20000); plain.setSoTimeout(30000);
            boolean ssl = "ssl".equals(sec) || ("auto".equals(sec) && port == 465);
            if (ssl) sock = tls(sf, plain, host, port); else sock = plain;
            sock.setSoTimeout(30000);
            BufferedReader r = new BufferedReader(new InputStreamReader(sock.getInputStream(), "UTF-8"));
            OutputStream o = sock.getOutputStream();
            expect(r, "220", "الخادم");
            cmd(o, "EHLO prayer.local"); String caps = readAll(r, "250", "EHLO");
            if (!ssl && !"none".equals(sec)) {   // STARTTLS: إلزامي إن اخترته، وانتهازي في «تلقائي» إن عرضه الخادم
                boolean offers = caps.toUpperCase().contains("STARTTLS");
                if ("starttls".equals(sec) && !offers) throw new Exception("الخادم لا يدعم STARTTLS");
                if (offers) {
                    cmd(o, "STARTTLS"); expect(r, "220", "STARTTLS");
                    sock = tls(sf, sock, host, port); sock.setSoTimeout(30000);
                    r = new BufferedReader(new InputStreamReader(sock.getInputStream(), "UTF-8")); o = sock.getOutputStream();
                    cmd(o, "EHLO prayer.local"); readAll(r, "250", "EHLO");
                }
            }
            cmd(o, "AUTH LOGIN"); expect(r, "334", "AUTH");
            cmd(o, b64(user.getBytes("UTF-8"))); expect(r, "334", "المستخدم");
            cmd(o, b64(pass.getBytes("UTF-8"))); expect(r, "235", "تسجيل الدخول (تحقق من كلمة مرور التطبيق)");
            cmd(o, "MAIL FROM:<" + from + ">"); expect(r, "250", "المرسل");
            StringBuilder toH = new StringBuilder();
            for (int i = 0; i < to.length(); i++) { String a = to.getString(i).trim(); if (a.isEmpty()) continue; cmd(o, "RCPT TO:<" + a + ">"); expect(r, "25", "المستلم " + a); if (toH.length() > 0) toH.append(", "); toH.append("<").append(a).append(">"); }
            cmd(o, "DATA"); expect(r, "354", "DATA");
            String bd = "=_pr" + System.currentTimeMillis();
            StringBuilder m = new StringBuilder();
            m.append("From: <").append(from).append(">\r\nTo: ").append(toH).append("\r\nSubject: ").append(enc(subject)).append("\r\nMIME-Version: 1.0\r\n");
            m.append("Content-Type: multipart/mixed; boundary=\"").append(bd).append("\"\r\n\r\n");
            m.append("--").append(bd).append("\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n").append(wrap(b64(body.getBytes("UTF-8")))).append("\r\n");
            m.append("--").append(bd).append("\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name=\"").append(fileName).append("\"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"").append(fileName).append("\"\r\n\r\n").append(wrap(b64(file))).append("\r\n");
            m.append("--").append(bd).append("--\r\n.\r\n");
            o.write(m.toString().getBytes("UTF-8")); o.flush();
            expect(r, "250", "الإرسال");
            cmd(o, "QUIT");
            return null;
        } catch (Exception e) { return e.getMessage() == null ? e.toString() : e.getMessage(); }
        finally { try { if (sock != null) sock.close(); } catch (Exception e) { /* ignore */ } }
    }

    private static String wrap(String b) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < b.length(); i += 76) sb.append(b, i, Math.min(b.length(), i + 76)).append("\r\n");
        return sb.toString();
    }
}
