package com.tareqsoft.prayer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import org.json.JSONObject;

/**
 * فحص صندوق الوارد عبر IMAP (بلا مكتبات) لإظهار إشعار منبثق بالرسائل الجديدة غير المقروءة.
 * يقرأ الترويسات فقط (BODY.PEEK فلا تتغير حالة الرسالة)، ويتذكّر آخر UID؛ أول فحص يضبط نقطة البداية دون إشعار بالقديم.
 */
public class MailInbox {
    static class Msg { long uid; String from = "", subject = "", date = ""; boolean seen; }

    private static final String NL = "\r\n";

    /** يفحص ويعيد الرسائل الجديدة، أو يرمي خطأً نصه سبب الفشل. firstSilent: أول مرة بلا إشعارات. */
    static List<Msg> check(Context c) throws Exception {
        JSONObject o = new JSONObject(MailSender.sp(c).getString("cfg", "{}"));
        String host = o.optString("imapHost", ""), sec = o.optString("imapSec", "auto"), user = o.optString("user", ""), pass = ErpClient.decText(MailSender.sp(c).getString("pw", ""));
        int port = o.optInt("imapPort", 143);
        if (host.isEmpty() || user.isEmpty() || pass.isEmpty()) throw new Exception("إعدادات الوارد ناقصة");
        Socket sock = null;
        try {
            SSLSocketFactory sf = (SSLSocketFactory) SSLSocketFactory.getDefault();
            Socket plain = new Socket(); plain.connect(new InetSocketAddress(host, port), 20000); plain.setSoTimeout(30000);
            boolean ssl = "ssl".equals(sec) || ("auto".equals(sec) && port == 993);
            sock = ssl ? tls(sf, plain, host, port) : plain;
            sock.setSoTimeout(30000);
            InputStream in = new BufferedInputStream(sock.getInputStream()); OutputStream out = sock.getOutputStream();
            String g = line(in);
            if (!g.startsWith("* OK") && !g.startsWith("* PREAUTH")) throw new Exception("الخادم: " + g);
            int tag = 0;
            if (!ssl && !"none".equals(sec)) {
                String caps = run(in, out, "a" + (++tag), "CAPABILITY", null);
                boolean offers = caps.toUpperCase().contains("STARTTLS");
                if ("starttls".equals(sec) && !offers) throw new Exception("الخادم لا يدعم STARTTLS");
                if (offers) {
                    run(in, out, "a" + (++tag), "STARTTLS", null);
                    sock = tls(sf, sock, host, port); sock.setSoTimeout(30000);
                    in = new BufferedInputStream(sock.getInputStream()); out = sock.getOutputStream();
                }
            }
            run(in, out, "a" + (++tag), "LOGIN " + q(user) + " " + q(pass), "تسجيل الدخول (تحقق من البريد وكلمة المرور)");
            String sel = run(in, out, "a" + (++tag), "SELECT INBOX", "فتح الوارد");
            long next = 1; Matcher m = Pattern.compile("UIDNEXT (\\d+)").matcher(sel); if (m.find()) next = Long.parseLong(m.group(1));
            long last = MailSender.sp(c).getLong("lastUid", -1);
            List<Msg> res = new ArrayList<Msg>();
            if (last < 0) { MailSender.sp(c).edit().putLong("lastUid", next - 1).apply(); }   // أول فحص: نقطة البداية فقط
            else if (next - 1 > last) {
                String f = run(in, out, "a" + (++tag), "UID FETCH " + (last + 1) + ":* (UID FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])", "قراءة الرسائل");
                long max = last;
                for (Msg x : parse(f)) { if (x.uid > last) { if (x.uid > max) max = x.uid; if (!x.seen) res.add(x); } }
                if (max > last) MailSender.sp(c).edit().putLong("lastUid", max).apply();
            }
            try { run(in, out, "a" + (++tag), "LOGOUT", null); } catch (Exception e) { /* ignore */ }
            return res;
        } finally { try { if (sock != null) sock.close(); } catch (Exception e) { /* ignore */ } }
    }

    private static SSLSocket tls(SSLSocketFactory sf, Socket plain, String host, int port) throws Exception {
        SSLSocket ss = (SSLSocket) sf.createSocket(plain, host, port, true);
        ss.setUseClientMode(true);
        javax.net.ssl.SSLParameters sp = ss.getSSLParameters(); sp.setEndpointIdentificationAlgorithm("HTTPS"); ss.setSSLParameters(sp);
        ss.startHandshake();
        return ss;
    }

    private static String q(String s) { return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""; }

    private static String line(InputStream in) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream(); int ch;
        while ((ch = in.read()) != -1) { if (ch == '\n') break; if (ch != '\r') b.write(ch); }
        if (ch == -1 && b.size() == 0) throw new Exception("انقطع الاتصال بالخادم");
        return b.toString("UTF-8");
    }

    /** يرسل أمراً بوسم ويقرأ كل الردود حتى السطر الموسوم، ويُدخل نصوص الـliteral {n} في الناتج. يرمي إن لم يكن OK. */
    private static String run(InputStream in, OutputStream out, String tag, String cmd, String what) throws Exception {
        out.write((tag + " " + cmd + NL).getBytes("UTF-8")); out.flush();
        StringBuilder sb = new StringBuilder(); String l;
        Pattern lit = Pattern.compile("\\{(\\d+)\\}$");
        while (true) {
            l = line(in);
            if (l.startsWith(tag + " ")) {
                if (!l.startsWith(tag + " OK")) throw new Exception((what == null ? cmd : what) + ": " + l.substring(tag.length() + 1));
                break;
            }
            sb.append(l).append('\n');
            Matcher m = lit.matcher(l);
            while (m.find()) {   // نص ملحق بحجم n ثم تتمة السطر
                int n = Integer.parseInt(m.group(1)); byte[] buf = new byte[n]; int got = 0;
                while (got < n) { int r = in.read(buf, got, n - got); if (r < 0) throw new Exception("انقطع الاتصال"); got += r; }
                sb.append(new String(buf, "UTF-8")).append('\n');
                String rest = line(in); sb.append(rest).append('\n');
                m = lit.matcher(rest);
            }
        }
        return sb.toString();
    }

    static List<Msg> parse(String f) {
        List<Msg> out = new ArrayList<Msg>(); Msg cur = null; String hdr = null;
        for (String l : f.split("\n")) {
            if (l.startsWith("* ") && l.contains(" FETCH")) {
                if (cur != null) out.add(fin(cur, hdr));
                cur = new Msg(); hdr = "";
                Matcher u = Pattern.compile("UID (\\d+)").matcher(l); if (u.find()) cur.uid = Long.parseLong(u.group(1));
                cur.seen = l.contains("\\Seen");
            } else if (cur != null) {
                Matcher u = Pattern.compile("UID (\\d+)").matcher(l); if (cur.uid == 0 && u.find()) cur.uid = Long.parseLong(u.group(1));
                if (l.contains("\\Seen")) cur.seen = true;
                hdr += l + "\n";
            }
        }
        if (cur != null) out.add(fin(cur, hdr));
        return out;
    }

    private static Msg fin(Msg m, String hdr) {
        String h = hdr.replaceAll("\n[ \t]+", " ");   // فك طيّ الأسطر
        for (String l : h.split("\n")) {
            String lo = l.toLowerCase(java.util.Locale.ROOT);
            if (lo.startsWith("from:")) m.from = dec(l.substring(5).trim());
            else if (lo.startsWith("subject:")) m.subject = dec(l.substring(8).trim());
            else if (lo.startsWith("date:")) m.date = l.substring(5).trim();
        }
        return m;
    }

    /** فك ترميز RFC 2047 (=?UTF-8?B?..?= و =?..?Q?..?=). */
    static String dec(String s) {
        try {
            Matcher m = Pattern.compile("=\\?([^?]+)\\?([BbQq])\\?([^?]*)\\?=").matcher(s.replaceAll("\\?=\\s+=\\?", "?==?"));
            StringBuffer sb = new StringBuffer();
            while (m.find()) {
                String cs = m.group(1), t = m.group(3), r;
                if (m.group(2).equalsIgnoreCase("B")) r = new String(android.util.Base64.decode(t, android.util.Base64.DEFAULT), cs);
                else {
                    ByteArrayOutputStream b = new ByteArrayOutputStream(); t = t.replace('_', ' ');
                    for (int i = 0; i < t.length(); i++) { char ch = t.charAt(i); if (ch == '=' && i + 2 < t.length() + 0 && i + 2 <= t.length() - 1 + 0) { b.write(Integer.parseInt(t.substring(i + 1, i + 3), 16)); i += 2; } else b.write(ch); }
                    r = new String(b.toByteArray(), cs);
                }
                m.appendReplacement(sb, Matcher.quoteReplacement(r));
            }
            m.appendTail(sb);
            return sb.toString().replaceAll("<[^>]*>", "").replace("\"", "").trim().isEmpty() ? s : sb.toString().replace("\"", "").trim();
        } catch (Exception e) { return s; }
    }

    /** إشعار + نافذة منبثقة بالرسائل الجديدة (النافذة تتطلب إذن العرض فوق التطبيقات). */
    static void notifyNew(Context app, List<Msg> l) {
        if (l.isEmpty()) return;
        StringBuilder body = new StringBuilder();
        for (int i = 0; i < l.size() && i < 4; i++) { Msg x = l.get(i); String fr = x.from.replaceAll("<.*>", "").trim(); if (fr.isEmpty()) fr = x.from; body.append(fr).append(" — ").append(x.subject.isEmpty() ? "(بلا موضوع)" : x.subject).append('\n'); }
        if (l.size() > 4) body.append("و").append(l.size() - 4).append(" أخرى");
        String title = l.size() == 1 ? "بريد جديد" : l.size() + " رسائل بريد جديدة", text = body.toString().trim();
        NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder nb;
        if (Build.VERSION.SDK_INT >= 26) { nm.createNotificationChannel(new NotificationChannel("mail_new", "البريد الجديد", NotificationManager.IMPORTANCE_HIGH)); nb = new Notification.Builder(app, "mail_new"); }
        else nb = new Notification.Builder(app).setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        int f = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent pi = PendingIntent.getActivity(app, 7616, new Intent(app, MainActivity.class).putExtra("tab", "mail").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP), f | PendingIntent.FLAG_UPDATE_CURRENT);
        nb.setContentTitle("✉️ " + title).setContentText(text.replace('\n', ' ')).setStyle(new Notification.BigTextStyle().bigText(text)).setSmallIcon(R.drawable.ic_stat_digest).setContentIntent(pi).setAutoCancel(true);
        nm.notify(5616, nb.build());
        ReminderActivity.popup(app, "mail", title, text, "openmail");
    }

    /** يفتح تطبيق البريد الافتراضي. */
    static Intent mailApp(Context c) {
        Intent i = Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_EMAIL);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return i;
    }
}
