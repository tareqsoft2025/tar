package com.tareqsoft.prayer;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.Charset;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * عميل بريد كامل بلا مكتبات (IMAP + SMTP + MIME) على غرار Outlook: المجلدات، قائمة الرسائل والبحث، قراءة الرسالة بنصها وصورها
 * ومرفقاتها، الأعلام (مقروءة/مهمة/تم الرد)، النقل والحذف، الإرسال والرد والتوجيه مع مرفقات، وحفظ نسخة في «المرسلة» والمسودات.
 * خالٍ من واجهات أندرويد ليُختبر على JVM؛ كل الدوال ترجع JSON نصياً {"ok":true,...} أو {"ok":false,"err":"..."}.
 */
public final class MailCore {
    private MailCore() { }

    public static class Conf {
        public String imapHost = "", imapSec = "auto", smtpHost = "", smtpSec = "auto", user = "", pass = "", from = "";
        public int imapPort = 143, smtpPort = 587;
    }

    static final Charset L1 = Charset.forName("ISO-8859-1"), U8 = Charset.forName("UTF-8");

    /* ===================== JSON ===================== */
    static String jq(String s) {
        if (s == null) return "\"\"";
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"') b.append("\\\""); else if (c == '\\') b.append("\\\\"); else if (c == '\n') b.append("\\n"); else if (c == '\r') b.append("\\r"); else if (c == '\t') b.append("\\t");
            else if (c < 32 || c == 0x2028 || c == 0x2029) b.append(String.format("\\u%04x", (int) c)); else b.append(c);
        }
        return b.append('"').toString();
    }
    static String err(String m) { return "{\"ok\":false,\"err\":" + jq(m) + "}"; }

    /* ===================== ترميزات ===================== */
    private static final String B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    public static String b64enc(byte[] d) {
        StringBuilder sb = new StringBuilder((d.length + 2) / 3 * 4);
        for (int i = 0; i < d.length; i += 3) {
            int n = (d[i] & 255) << 16 | (i + 1 < d.length ? (d[i + 1] & 255) << 8 : 0) | (i + 2 < d.length ? d[i + 2] & 255 : 0);
            sb.append(B64.charAt(n >> 18 & 63)).append(B64.charAt(n >> 12 & 63)).append(i + 1 < d.length ? B64.charAt(n >> 6 & 63) : '=').append(i + 2 < d.length ? B64.charAt(n & 63) : '=');
        }
        return sb.toString();
    }
    public static byte[] b64dec(String s) {
        ByteArrayOutputStream o = new ByteArrayOutputStream(); int acc = 0, bits = 0;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i); int v = B64.indexOf(c);
            if (c == '-') v = 62; else if (c == '_') v = 63;   // base64url
            if (v < 0) continue;
            acc = acc << 6 | v; bits += 6;
            if (bits >= 8) { bits -= 8; o.write(acc >> bits & 255); }
        }
        return o.toByteArray();
    }
    static String wrap76(String b) { StringBuilder sb = new StringBuilder(); for (int i = 0; i < b.length(); i += 76) sb.append(b, i, Math.min(b.length(), i + 76)).append("\r\n"); return sb.toString(); }
    static byte[] qpdec(String s, boolean header) {
        ByteArrayOutputStream b = new ByteArrayOutputStream(); if (header) s = s.replace('_', ' ');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '=' && i + 1 < s.length() && (s.charAt(i + 1) == '\r' || s.charAt(i + 1) == '\n')) { i++; if (s.charAt(i) == '\r' && i + 1 < s.length() && s.charAt(i + 1) == '\n') i++; }
            else if (c == '=' && i + 2 < s.length() + 0 && isHex(s.charAt(i + 1)) && isHex(s.charAt(i + 2))) { b.write(Integer.parseInt(s.substring(i + 1, i + 3), 16)); i += 2; }
            else b.write(c);
        }
        return b.toByteArray();
    }
    private static boolean isHex(char c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'); }
    static String decode(byte[] b, String cs) {
        try { return new String(b, Charset.forName(cs == null || cs.isEmpty() ? "UTF-8" : cs)); } catch (Exception e) { return new String(b, U8); }
    }
    /** RFC 2047: =?charset?B|Q?text?= */
    static String dec2047(String s) {
        if (s == null || !s.contains("=?")) return s == null ? "" : s;
        Matcher m = Pattern.compile("=\\?([^?]+)\\?([BbQq])\\?([^?]*)\\?=").matcher(s.replaceAll("\\?=\\s+=\\?", "?==?"));
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            byte[] d = m.group(2).equalsIgnoreCase("B") ? b64dec(m.group(3)) : qpdec(m.group(3), true);
            m.appendReplacement(sb, Matcher.quoteReplacement(decode(d, m.group(1))));
        }
        m.appendTail(sb); return sb.toString();
    }
    static String enc2047(String s) {
        boolean ascii = true; for (int i = 0; i < s.length(); i++) if (s.charAt(i) > 126 || s.charAt(i) < 32) { ascii = false; break; }
        return ascii ? s : "=?UTF-8?B?" + b64enc(s.getBytes(U8)) + "?=";
    }
    /** UTF-7 المعدّل لأسماء مجلدات IMAP (&AGE-). */
    static String mutf7dec(String s) {
        if (!s.contains("&")) return s;
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c != '&') { out.append(c); continue; }
            int e = s.indexOf('-', i); if (e < 0) { out.append(s.substring(i)); break; }
            if (e == i + 1) out.append('&');
            else { byte[] d = b64dec(s.substring(i + 1, e).replace(',', '/')); for (int k = 0; k + 1 < d.length; k += 2) out.append((char) ((d[k] & 255) << 8 | (d[k + 1] & 255))); }
            i = e;
        }
        return out.toString();
    }
    static String mutf7enc(String s) {
        StringBuilder out = new StringBuilder(); StringBuilder run = new StringBuilder();
        for (int i = 0; i <= s.length(); i++) {
            char c = i < s.length() ? s.charAt(i) : 0; boolean plain = i < s.length() && c >= 0x20 && c <= 0x7e;
            if (plain || i == s.length()) {
                if (run.length() > 0) { byte[] d = new byte[run.length() * 2]; for (int k = 0; k < run.length(); k++) { d[2 * k] = (byte) (run.charAt(k) >> 8); d[2 * k + 1] = (byte) run.charAt(k); } out.append('&').append(b64enc(d).replace("=", "").replace('/', ',')).append('-'); run.setLength(0); }
                if (i < s.length()) out.append(c == '&' ? "&-" : String.valueOf(c));
            } else run.append(c);
        }
        return out.toString();
    }

    /* ===================== IMAP ===================== */
    static class Resp { StringBuilder text = new StringBuilder(); List<String> lits = new ArrayList<String>(); String status = ""; }

    public static class Imap {
        Socket sock; InputStream in; OutputStream out; int tag = 0; public String caps = "";
        public Imap(Conf c) throws Exception {
            if (c.imapHost.isEmpty() || c.user.isEmpty() || c.pass.isEmpty()) throw new Exception("إعدادات الوارد ناقصة");
            SSLSocketFactory sf = (SSLSocketFactory) SSLSocketFactory.getDefault();
            Socket plain = new Socket(); plain.connect(new InetSocketAddress(c.imapHost, c.imapPort), 20000); plain.setSoTimeout(45000);
            boolean ssl = "ssl".equals(c.imapSec) || ("auto".equals(c.imapSec) && c.imapPort == 993);
            sock = ssl ? tls(sf, plain, c.imapHost, c.imapPort) : plain; sock.setSoTimeout(45000);
            in = new BufferedInputStream(sock.getInputStream()); out = sock.getOutputStream();
            String g = line(in); if (!g.startsWith("* OK") && !g.startsWith("* PREAUTH")) throw new Exception("الخادم: " + g);
            caps = cmd("CAPABILITY", null).text.toString().toUpperCase();
            if (!ssl && !"none".equals(c.imapSec)) {
                boolean offers = caps.contains("STARTTLS");
                if ("starttls".equals(c.imapSec) && !offers) throw new Exception("الخادم لا يدعم STARTTLS");
                if (offers) { cmd("STARTTLS", null); sock = tls(sf, sock, c.imapHost, c.imapPort); sock.setSoTimeout(45000); in = new BufferedInputStream(sock.getInputStream()); out = sock.getOutputStream(); caps = cmd("CAPABILITY", null).text.toString().toUpperCase(); }
            }
            cmd("LOGIN " + q(c.user) + " " + q(c.pass), "تسجيل الدخول (تحقق من البريد وكلمة المرور)");
        }
        static SSLSocket tls(SSLSocketFactory sf, Socket plain, String host, int port) throws Exception {
            SSLSocket ss = (SSLSocket) sf.createSocket(plain, host, port, true); ss.setUseClientMode(true);
            SSLParameters sp = ss.getSSLParameters(); sp.setEndpointIdentificationAlgorithm("HTTPS"); ss.setSSLParameters(sp); ss.startHandshake(); return ss;
        }
        static String q(String s) { return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""; }
        static String line(InputStream in) throws Exception {
            ByteArrayOutputStream b = new ByteArrayOutputStream(); int ch;
            while ((ch = in.read()) != -1) { if (ch == '\n') break; if (ch != '\r') b.write(ch); }
            if (ch == -1 && b.size() == 0) throw new Exception("انقطع الاتصال بالخادم");
            return new String(b.toByteArray(), L1);
        }
        static final Pattern LIT = Pattern.compile("\\{(\\d+)\\}$");
        public Resp cmd(String c, String what) throws Exception {
            String t = "a" + (++tag);
            out.write((t + " " + c + "\r\n").getBytes(U8)); out.flush();
            return readResp(t, c, what);
        }
        Resp readResp(String t, String c, String what) throws Exception {
            Resp r = new Resp();
            while (true) {
                String l = line(in);
                if (l.startsWith(t + " ")) { r.status = l.substring(t.length() + 1); if (!r.status.startsWith("OK")) throw new Exception((what == null ? c.split(" ")[0] : what) + ": " + r.status); return r; }
                r.text.append(l).append('\n');
                Matcher m = LIT.matcher(l);
                while (m.find()) {
                    int n = Integer.parseInt(m.group(1)); byte[] buf = new byte[n]; int got = 0;
                    while (got < n) { int k = in.read(buf, got, n - got); if (k < 0) throw new Exception("انقطع الاتصال"); got += k; }
                    r.lits.add(new String(buf, L1)); r.text.append('\u0001').append(r.lits.size() - 1).append('\u0001');
                    String rest = line(in); r.text.append(rest).append('\n'); m = LIT.matcher(rest);
                }
            }
        }
        /** APPEND برسالة خام (literal). */
        public void append(String folder, String flags, byte[] msg) throws Exception {
            String t = "a" + (++tag);
            out.write((t + " APPEND " + q(mutf7enc(folder)) + (flags.isEmpty() ? "" : " (" + flags + ")") + " {" + msg.length + "}\r\n").getBytes(U8)); out.flush();
            String l = line(in); if (!l.startsWith("+")) throw new Exception("APPEND: " + l);
            out.write(msg); out.write("\r\n".getBytes(U8)); out.flush();
            readResp(t, "APPEND", "حفظ الرسالة");
        }
        public void close() { try { cmd("LOGOUT", null); } catch (Exception e) { /* ignore */ } try { sock.close(); } catch (Exception e) { /* ignore */ } }
    }

    static String sel(String folder) { return "SELECT " + Imap.q(mutf7enc(folder)); }

    /* ---------- المجلدات ---------- */
    public static String folders(Conf c) {
        Imap im = null;
        try {
            im = new Imap(c);
            Resp r = im.cmd("LIST \"\" \"*\"", "قائمة المجلدات");
            StringBuilder sb = new StringBuilder("{\"ok\":true,\"folders\":["); int n = 0;
            Pattern p = Pattern.compile("^\\* LIST \\(([^)]*)\\) (?:\"(?:[^\"\\\\]|\\\\.)*\"|NIL) (.+)$");
            for (String l : r.text.toString().split("\n")) {
                Matcher m = p.matcher(l); if (!m.find()) continue;
                String attrs = m.group(1), nm = m.group(2).trim();
                if (attrs.toLowerCase(Locale.ROOT).contains("\\noselect")) continue;
                if (nm.startsWith("\"")) nm = nm.substring(1, nm.length() - 1).replace("\\\"", "\"").replace("\\\\", "\\");
                else if (nm.startsWith("\u0001")) nm = r.lits.get(Integer.parseInt(nm.replace("\u0001", "")));
                String role = roleOf(attrs, nm), disp = mutf7dec(nm);
                int total = 0, unseen = 0;
                if (n < 30) { try { Resp s = im.cmd("STATUS " + Imap.q(nm) + " (MESSAGES UNSEEN)", null); Matcher a = Pattern.compile("MESSAGES (\\d+)").matcher(s.text); if (a.find()) total = Integer.parseInt(a.group(1)); a = Pattern.compile("UNSEEN (\\d+)").matcher(s.text); if (a.find()) unseen = Integer.parseInt(a.group(1)); } catch (Exception e) { /* بلا عدّاد */ } }
                if (n++ > 0) sb.append(',');
                sb.append("{\"name\":").append(jq(nm)).append(",\"disp\":").append(jq(disp)).append(",\"role\":").append(jq(role)).append(",\"total\":").append(total).append(",\"unseen\":").append(unseen).append('}');
            }
            return sb.append("]}").toString();
        } catch (Exception e) { return err(msg(e)); } finally { if (im != null) im.close(); }
    }
    static String roleOf(String attrs, String name) {
        String a = attrs.toLowerCase(Locale.ROOT), n = mutf7dec(name).toLowerCase(Locale.ROOT);
        if (name.equalsIgnoreCase("INBOX")) return "inbox";
        if (a.contains("\\sent") || n.matches(".*(sent|مرسل).*")) return "sent";
        if (a.contains("\\drafts") || n.matches(".*(draft|مسود).*")) return "drafts";
        if (a.contains("\\trash") || n.matches(".*(trash|deleted|bin|محذوف|المهملات).*")) return "trash";
        if (a.contains("\\junk") || n.matches(".*(junk|spam|مزعج).*")) return "junk";
        if (a.contains("\\archive") || n.matches(".*(archive|أرشيف).*")) return "archive";
        return "";
    }
    static String msg(Exception e) { return e.getMessage() == null ? e.toString() : e.getMessage(); }

    /* ---------- قائمة الرسائل / بحث ---------- */
    /** offset: عدد الرسائل الأحدث المتجاوَزة؛ q: نص بحث (موضوع/مرسل/نص)؛ unseenOnly: غير المقروءة فقط. */
    public static String list(Conf c, String folder, int offset, int size, String q, boolean unseenOnly) {
        Imap im = null;
        try {
            im = new Imap(c);
            Resp s = im.cmd(sel(folder), "فتح المجلد");
            Matcher mm = Pattern.compile("(\\d+) EXISTS").matcher(s.text); int exists = mm.find() ? Integer.parseInt(mm.group(1)) : 0;
            List<Long> uids = new ArrayList<Long>(); String set; int total;
            if ((q != null && !q.trim().isEmpty()) || unseenOnly) {
                String crit = (unseenOnly ? "UNSEEN " : "") + ((q != null && !q.trim().isEmpty()) ? "OR OR SUBJECT " + qs(q) + " FROM " + qs(q) + " TO " + qs(q) : "");
                Resp r = im.cmd("UID SEARCH " + ((q != null && !q.trim().isEmpty()) ? "CHARSET UTF-8 " : "") + crit.trim(), "بحث");
                Matcher m = Pattern.compile("SEARCH ([\\d ]+)").matcher(r.text);
                if (m.find()) for (String u : m.group(1).trim().split(" ")) if (!u.isEmpty()) uids.add(Long.parseLong(u));
                java.util.Collections.sort(uids, java.util.Collections.reverseOrder());
                total = uids.size();
                int from = Math.min(offset, uids.size()), to = Math.min(uids.size(), offset + size);
                uids = new ArrayList<Long>(uids.subList(from, to));
                if (uids.isEmpty()) return "{\"ok\":true,\"total\":" + total + ",\"items\":[]}";
                StringBuilder sb = new StringBuilder(); for (long u : uids) { if (sb.length() > 0) sb.append(','); sb.append(u); }
                set = sb.toString();
            } else {
                total = exists;
                int hi = exists - offset, lo = Math.max(1, hi - size + 1);
                if (hi < 1) return "{\"ok\":true,\"total\":" + total + ",\"items\":[]}";
                set = lo + ":" + hi;
            }
            boolean byUid = (q != null && !q.trim().isEmpty()) || unseenOnly;
            Resp f = im.cmd((byUid ? "UID FETCH " : "FETCH ") + set + " (UID FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE CONTENT-TYPE MESSAGE-ID)])", "قراءة الرسائل");
            List<String[]> items = new ArrayList<String[]>(); List<Long> order = new ArrayList<Long>();
            StringBuilder out = new StringBuilder("{\"ok\":true,\"total\":" + total + ",\"items\":[");
            List<long[]> keys = new ArrayList<long[]>(); List<String> js = new ArrayList<String>();
            for (String blk : splitFetch(f.text.toString())) {
                long uid = grabLong(blk, "UID (\\d+)"); String flags = grab(blk, "FLAGS \\(([^)]*)\\)"); String idate = grab(blk, "INTERNALDATE \"([^\"]+)\""); long size2 = grabLong(blk, "RFC822\\.SIZE (\\d+)");
                String hdr = fetchLit(blk, f.lits); Map<String, String> h = headers(hdr);
                long ts = parseDate(h.get("date"), idate);
                String ct = h.getOrDefault("content-type", "").toLowerCase(Locale.ROOT);
                boolean att = ct.contains("multipart/mixed") || ct.contains("multipart/related") && false || ct.contains("application/");
                String fl = flags == null ? "" : flags;
                js.add("{\"uid\":" + uid + ",\"from\":" + jq(addrName(dec2047(h.getOrDefault("from", "")))) + ",\"fromAddr\":" + jq(addrEmail(dec2047(h.getOrDefault("from", "")))) + ",\"to\":" + jq(dec2047(h.getOrDefault("to", ""))) + ",\"subject\":" + jq(dec2047(h.getOrDefault("subject", ""))) + ",\"ts\":" + ts + ",\"seen\":" + fl.contains("\\Seen") + ",\"flag\":" + fl.contains("\\Flagged") + ",\"answered\":" + fl.contains("\\Answered") + ",\"draft\":" + fl.contains("\\Draft") + ",\"att\":" + att + ",\"size\":" + size2 + "}");
                keys.add(new long[] { ts, uid });
            }
            Integer[] idx = new Integer[js.size()]; for (int i = 0; i < idx.length; i++) idx[i] = i;
            final List<long[]> K = keys;
            java.util.Arrays.sort(idx, new java.util.Comparator<Integer>() { public int compare(Integer a, Integer b) { return Long.compare(K.get(b)[1], K.get(a)[1]); } });
            for (int i = 0; i < idx.length; i++) { if (i > 0) out.append(','); out.append(js.get(idx[i])); }
            return out.append("]}").toString();
        } catch (Exception e) { return err(msg(e)); } finally { if (im != null) im.close(); }
    }
    static String qs(String s) { return "\"" + new String(s.trim().replace("\\", "\\\\").replace("\"", "\\\"").getBytes(U8), L1) + "\""; }
    static String grab(String s, String re) { Matcher m = Pattern.compile(re).matcher(s); return m.find() ? m.group(1) : null; }
    static long grabLong(String s, String re) { String g = grab(s, re); return g == null ? 0 : Long.parseLong(g); }
    /** يقسم رد FETCH إلى كتل لكل رسالة (تبدأ بـ «* n FETCH»). */
    static List<String> splitFetch(String t) {
        List<String> out = new ArrayList<String>(); StringBuilder cur = null;
        for (String l : t.split("\n", -1)) {
            if (l.matches("^\\* \\d+ FETCH.*")) { if (cur != null) out.add(cur.toString()); cur = new StringBuilder(); }
            if (cur != null) cur.append(l).append('\n');
        }
        if (cur != null) out.add(cur.toString()); return out;
    }
    static String fetchLit(String blk, List<String> lits) {
        Matcher m = Pattern.compile("\u0001(\\d+)\u0001").matcher(blk); return m.find() ? lits.get(Integer.parseInt(m.group(1))) : "";
    }
    static Map<String, String> headers(String raw) {
        Map<String, String> h = new HashMap<String, String>();
        String un = raw.replaceAll("\r?\n[ \t]+", " ");
        for (String l : un.split("\r?\n")) { int i = l.indexOf(':'); if (i > 0) { String k = l.substring(0, i).trim().toLowerCase(Locale.ROOT); if (!h.containsKey(k)) h.put(k, l.substring(i + 1).trim()); } }
        return h;
    }
    static String addrName(String a) { String n = a.replaceAll("<[^>]*>", "").replace("\"", "").trim(); return n.isEmpty() ? addrEmail(a) : n; }
    static String addrEmail(String a) { Matcher m = Pattern.compile("<([^>]+)>").matcher(a); if (m.find()) return m.group(1).trim(); m = Pattern.compile("[\\w.+-]+@[\\w.-]+").matcher(a); return m.find() ? m.group() : a.trim(); }
    static long parseDate(String hdr, String idate) {
        String[] fmts = { "EEE, d MMM yyyy HH:mm:ss Z", "d MMM yyyy HH:mm:ss Z", "EEE, d MMM yyyy HH:mm Z", "EEE, d MMM yyyy HH:mm:ss z" };
        if (hdr != null) { String h = hdr.replaceAll("\\s*\\(.*\\)$", "").trim(); for (String f : fmts) { try { return new SimpleDateFormat(f, Locale.US).parse(h).getTime(); } catch (Exception e) { /* التالي */ } } }
        if (idate != null) { try { return new SimpleDateFormat("d-MMM-yyyy HH:mm:ss Z", Locale.US).parse(idate.trim()).getTime(); } catch (Exception e) { /* ignore */ } }
        return 0;
    }

    /* ===================== MIME ===================== */
    static class Part {
        Map<String, String> h = new HashMap<String, String>(); String type = "text/plain", charset = "", name = "", disp = "", cid = ""; byte[] body = new byte[0]; List<Part> kids = new ArrayList<Part>(); int idx = -1;
    }
    static Map<String, String> params(String v) {
        Map<String, String> m = new HashMap<String, String>(); if (v == null) return m;
        Matcher x = Pattern.compile(";\\s*([\\w*-]+)\\s*=\\s*(\"([^\"]*)\"|[^;]*)").matcher(v);
        while (x.find()) { String val = x.group(3) != null ? x.group(3) : x.group(2).trim(); m.put(x.group(1).toLowerCase(Locale.ROOT), val); }
        return m;
    }
    static String filename(Map<String, String> p) {
        String ext = p.get("filename*"); if (ext != null) { int i = ext.indexOf("''"); if (i > 0) return decode(urlDec(ext.substring(i + 2)), ext.substring(0, i)); }
        String n = p.get("filename"); if (n == null) n = p.get("name"); return n == null ? "" : dec2047(n);
    }
    static byte[] urlDec(String s) { ByteArrayOutputStream b = new ByteArrayOutputStream(); for (int i = 0; i < s.length(); i++) { char c = s.charAt(i); if (c == '%' && i + 2 < s.length() + 0 && isHex(s.charAt(i + 1)) && isHex(s.charAt(i + 2))) { b.write(Integer.parseInt(s.substring(i + 1, i + 3), 16)); i += 2; } else b.write(c); } return b.toByteArray(); }

    static Part parseMime(String raw) {
        Part p = new Part(); int sep = indexOfBlank(raw); String head = sep < 0 ? raw : raw.substring(0, sep), body = sep < 0 ? "" : raw.substring(sep).replaceFirst("^\r?\n\r?\n", "");
        p.h = headers(head);
        String ct = p.h.getOrDefault("content-type", "text/plain"); p.type = ct.split(";")[0].trim().toLowerCase(Locale.ROOT);
        Map<String, String> pr = params(ct); p.charset = pr.getOrDefault("charset", ""); p.name = filename(pr);
        String cd = p.h.getOrDefault("content-disposition", ""); p.disp = cd.split(";")[0].trim().toLowerCase(Locale.ROOT);
        Map<String, String> dp = params(cd); String fn = filename(dp); if (!fn.isEmpty()) p.name = fn;
        p.cid = p.h.getOrDefault("content-id", "").replace("<", "").replace(">", "").trim();
        if (p.type.startsWith("multipart/")) {
            String bd = pr.get("boundary"); if (bd != null) {
                String[] segs = body.split("(?m)^--" + Pattern.quote(bd) + "(--)?[ \t]*\r?$");
                for (int i = 1; i < segs.length; i++) { String sgm = segs[i].replaceFirst("^\r?\n", "").replaceFirst("\r?\n$", ""); if (sgm.trim().isEmpty()) continue; p.kids.add(parseMime(sgm)); }
            }
        } else {
            String te = p.h.getOrDefault("content-transfer-encoding", "7bit").trim().toLowerCase(Locale.ROOT);
            if (te.equals("base64")) p.body = b64dec(body); else if (te.equals("quoted-printable")) p.body = qpdec(body, false); else p.body = body.getBytes(L1);
        }
        return p;
    }
    static int indexOfBlank(String s) { int a = s.indexOf("\r\n\r\n"), b = s.indexOf("\n\n"); if (a < 0) return b; if (b < 0) return a; return Math.min(a, b); }

    static void walk(Part p, List<Part> leaves) { if (p.kids.isEmpty()) leaves.add(p); else for (Part k : p.kids) walk(k, leaves); }

    /* ---------- قراءة رسالة ---------- */
    public static String get(Conf c, String folder, long uid) {
        Imap im = null;
        try {
            im = new Imap(c); im.cmd(sel(folder), "فتح المجلد");
            Resp f = im.cmd("UID FETCH " + uid + " (FLAGS BODY.PEEK[])", "قراءة الرسالة");
            List<String> blks = splitFetch(f.text.toString()); if (blks.isEmpty()) return err("الرسالة غير موجودة");
            String raw = fetchLit(blks.get(0), f.lits), flags = grab(blks.get(0), "FLAGS \\(([^)]*)\\)");
            Part root = parseMime(raw); List<Part> leaves = new ArrayList<Part>(); walk(root, leaves);
            String text = null, html = null; List<Part> atts = new ArrayList<Part>(); Map<String, Part> cids = new HashMap<String, Part>();
            for (Part l : leaves) {
                boolean isAtt = l.disp.equals("attachment") || !l.name.isEmpty() && !l.type.startsWith("text/") ;
                if (l.type.equals("text/plain") && !isAtt && text == null && l.name.isEmpty()) text = decode(l.body, l.charset);
                else if (l.type.equals("text/html") && !isAtt && html == null && l.name.isEmpty()) html = decode(l.body, l.charset);
                else if (!l.cid.isEmpty() && l.type.startsWith("image/")) { cids.put(l.cid, l); }
                else if (l.type.startsWith("message/") || !l.type.startsWith("text/") || !l.name.isEmpty() || isAtt) { l.idx = atts.size(); atts.add(l); }
            }
            if (html != null) for (Map.Entry<String, Part> e : cids.entrySet()) { if (e.getValue().body.length < 400000) html = html.replace("cid:" + e.getKey(), "data:" + e.getValue().type + ";base64," + b64enc(e.getValue().body)); }
            Map<String, String> h = root.h;
            StringBuilder sb = new StringBuilder("{\"ok\":true,\"uid\":" + uid + ",\"seen\":" + (flags != null && flags.contains("\\Seen")) + ",\"flag\":" + (flags != null && flags.contains("\\Flagged")) + ",");
            sb.append("\"from\":").append(jq(dec2047(h.getOrDefault("from", "")))).append(",\"to\":").append(jq(dec2047(h.getOrDefault("to", "")))).append(",\"cc\":").append(jq(dec2047(h.getOrDefault("cc", "")))).append(",\"replyTo\":").append(jq(dec2047(h.getOrDefault("reply-to", "")))).append(",\"subject\":").append(jq(dec2047(h.getOrDefault("subject", "")))).append(",\"ts\":").append(parseDate(h.get("date"), null)).append(",\"msgId\":").append(jq(h.getOrDefault("message-id", ""))).append(",\"refs\":").append(jq(h.getOrDefault("references", ""))).append(",");
            String t = text == null ? "" : text, hh = html == null ? "" : html;
            if (t.length() > 1500000) t = t.substring(0, 1500000); if (hh.length() > 2500000) hh = hh.substring(0, 2500000);
            sb.append("\"text\":").append(jq(t)).append(",\"html\":").append(jq(hh)).append(",\"atts\":[");
            for (int i = 0; i < atts.size(); i++) { Part a = atts.get(i); if (i > 0) sb.append(','); sb.append("{\"idx\":").append(i).append(",\"name\":").append(jq(a.name.isEmpty() ? "مرفق" + (i + 1) : a.name)).append(",\"type\":").append(jq(a.type)).append(",\"size\":").append(a.body.length).append('}'); }
            return sb.append("]}").toString();
        } catch (Exception e) { return err(msg(e)); } finally { if (im != null) im.close(); }
    }

    /** محتوى مرفق (base64) لفتحه أو مشاركته. */
    public static String attachment(Conf c, String folder, long uid, int idx) {
        Imap im = null;
        try {
            im = new Imap(c); im.cmd(sel(folder), "فتح المجلد");
            Resp f = im.cmd("UID FETCH " + uid + " (BODY.PEEK[])", "قراءة الرسالة");
            List<String> blks = splitFetch(f.text.toString()); if (blks.isEmpty()) return err("الرسالة غير موجودة");
            Part root = parseMime(fetchLit(blks.get(0), f.lits)); List<Part> leaves = new ArrayList<Part>(); walk(root, leaves);
            int k = 0; String text = null, html = null;
            for (Part l : leaves) {
                boolean isAtt = l.disp.equals("attachment") || !l.name.isEmpty() && !l.type.startsWith("text/");
                if (l.type.equals("text/plain") && !isAtt && text == null && l.name.isEmpty()) { text = ""; continue; }
                if (l.type.equals("text/html") && !isAtt && html == null && l.name.isEmpty()) { html = ""; continue; }
                if (!l.cid.isEmpty() && l.type.startsWith("image/")) continue;
                if (l.type.startsWith("message/") || !l.type.startsWith("text/") || !l.name.isEmpty() || isAtt) { if (k++ == idx) return "{\"ok\":true,\"name\":" + jq(l.name.isEmpty() ? "attachment" : l.name) + ",\"type\":" + jq(l.type) + ",\"b64\":" + jq(b64enc(l.body)) + "}"; }
            }
            return err("المرفق غير موجود");
        } catch (Exception e) { return err(msg(e)); } finally { if (im != null) im.close(); }
    }

    /* ---------- أعلام ونقل وحذف ---------- */
    static String uidSet(long[] u) { StringBuilder sb = new StringBuilder(); for (long x : u) { if (sb.length() > 0) sb.append(','); sb.append(x); } return sb.toString(); }

    public static String flag(Conf c, String folder, long[] uids, boolean add, String flag) {
        Imap im = null;
        try { im = new Imap(c); im.cmd(sel(folder), "فتح المجلد"); im.cmd("UID STORE " + uidSet(uids) + (add ? " +FLAGS (" : " -FLAGS (") + flag + ")", "تعديل الحالة"); return "{\"ok\":true}"; }
        catch (Exception e) { return err(msg(e)); } finally { if (im != null) im.close(); }
    }
    public static String move(Conf c, String folder, long[] uids, String dest) {
        Imap im = null;
        try {
            im = new Imap(c); im.cmd(sel(folder), "فتح المجلد"); String set = uidSet(uids), d = Imap.q(mutf7enc(dest));
            if (im.caps.contains("MOVE")) im.cmd("UID MOVE " + set + " " + d, "النقل");
            else { im.cmd("UID COPY " + set + " " + d, "النقل"); im.cmd("UID STORE " + set + " +FLAGS (\\Deleted)", "حذف الأصل"); expunge(im, set); }
            return "{\"ok\":true}";
        } catch (Exception e) { return err(msg(e)); } finally { if (im != null) im.close(); }
    }
    static void expunge(Imap im, String set) throws Exception { if (im.caps.contains("UIDPLUS")) im.cmd("UID EXPUNGE " + set, null); else im.cmd("EXPUNGE", null); }
    /** trash فارغ أو permanent: حذف نهائي؛ وإلا نقل إلى المهملات. */
    public static String delete(Conf c, String folder, long[] uids, String trash, boolean permanent) {
        if (!permanent && trash != null && !trash.isEmpty() && !trash.equals(folder)) return move(c, folder, uids, trash);
        Imap im = null;
        try { im = new Imap(c); im.cmd(sel(folder), "فتح المجلد"); String set = uidSet(uids); im.cmd("UID STORE " + set + " +FLAGS (\\Deleted)", "حذف"); expunge(im, set); return "{\"ok\":true}"; }
        catch (Exception e) { return err(msg(e)); } finally { if (im != null) im.close(); }
    }
    /** إنشاء مجلد (Outlook: مجلد جديد). */
    public static String createFolder(Conf c, String name) {
        Imap im = null;
        try { im = new Imap(c); im.cmd("CREATE " + Imap.q(mutf7enc(name)), "إنشاء المجلد"); return "{\"ok\":true}"; }
        catch (Exception e) { return err(msg(e)); } finally { if (im != null) im.close(); }
    }
    /** إفراغ المهملات/السبام. */
    public static String emptyFolder(Conf c, String folder) {
        Imap im = null;
        try { im = new Imap(c); im.cmd(sel(folder), "فتح المجلد"); im.cmd("STORE 1:* +FLAGS (\\Deleted)", "حذف"); im.cmd("EXPUNGE", null); return "{\"ok\":true}"; }
        catch (Exception e) { return err(msg(e)); } finally { if (im != null) im.close(); }
    }

    /* ===================== إنشاء رسالة وإرسالها ===================== */
    public static class Att { public String name, type; public byte[] data; }
    public static byte[] buildMime(String from, List<String> to, List<String> cc, String subject, String text, String html, List<Att> atts, String inReplyTo, String refs) throws Exception {
        String bd = "=_pr" + System.currentTimeMillis() + Integer.toHexString((int) (Math.random() * 99999)), alt = "=_al" + System.currentTimeMillis();
        StringBuilder m = new StringBuilder();
        String domain = from.contains("@") ? from.substring(from.indexOf('@') + 1).replaceAll("[^\\w.-]", "") : "prayer.local";
        m.append("From: ").append(from).append("\r\nTo: ").append(join(to)).append("\r\n");
        if (cc != null && !cc.isEmpty()) m.append("Cc: ").append(join(cc)).append("\r\n");
        m.append("Subject: ").append(enc2047(subject == null ? "" : subject)).append("\r\nDate: ").append(new SimpleDateFormat("EEE, d MMM yyyy HH:mm:ss Z", Locale.US).format(new Date())).append("\r\nMessage-ID: <").append(System.currentTimeMillis()).append('.').append((int) (Math.random() * 1e6)).append('@').append(domain).append(">\r\n");
        if (inReplyTo != null && !inReplyTo.isEmpty()) m.append("In-Reply-To: ").append(inReplyTo).append("\r\n");
        if (refs != null && !refs.isEmpty()) m.append("References: ").append(refs).append("\r\n");
        m.append("MIME-Version: 1.0\r\n");
        boolean hasHtml = html != null && !html.trim().isEmpty(), hasAtt = atts != null && !atts.isEmpty();
        String t = text == null ? "" : text;
        if (!hasAtt && !hasHtml) {
            m.append("Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n").append(wrap76(b64enc(t.getBytes(U8))));
        } else {
            if (hasAtt) m.append("Content-Type: multipart/mixed; boundary=\"").append(bd).append("\"\r\n\r\n--").append(bd).append("\r\n");
            if (hasHtml) {
                m.append("Content-Type: multipart/alternative; boundary=\"").append(alt).append("\"\r\n\r\n--").append(alt).append("\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n").append(wrap76(b64enc(t.getBytes(U8))));
                m.append("--").append(alt).append("\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n").append(wrap76(b64enc(html.getBytes(U8)))).append("--").append(alt).append("--\r\n");
            } else m.append("Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n").append(wrap76(b64enc(t.getBytes(U8))));
            if (hasAtt) {
                for (Att a : atts) m.append("--").append(bd).append("\r\nContent-Type: ").append(a.type == null || a.type.isEmpty() ? "application/octet-stream" : a.type).append("; name=\"").append(enc2047(a.name)).append("\"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"").append(enc2047(a.name)).append("\"\r\n\r\n").append(wrap76(b64enc(a.data)));
                m.append("--").append(bd).append("--\r\n");
            }
        }
        return m.toString().getBytes(L1);
    }
    static String join(List<String> l) { StringBuilder s = new StringBuilder(); for (String x : l) { if (s.length() > 0) s.append(", "); s.append(x); } return s.toString(); }

    /** يرسل رسالة خام عبر SMTP (تلقائي/SSL/STARTTLS/بلا) ثم يحفظ نسخة في «المرسلة» إن وُجد اسمها. */
    public static String send(Conf c, List<String> to, List<String> cc, List<String> bcc, String subject, String text, String html, List<Att> atts, String inReplyTo, String refs, String sentFolder) {
        try {
            List<String> all = new ArrayList<String>(to); if (cc != null) all.addAll(cc); if (bcc != null) all.addAll(bcc);
            if (all.isEmpty()) return err("أضف مستلماً واحداً على الأقل");
            String from = c.from.isEmpty() ? c.user : c.from;
            byte[] mime = buildMime(from, to, cc, subject, text, html, atts, inReplyTo, refs);
            String e = smtp(c, from, all, mime); if (e != null) return err(e);
            if (sentFolder != null && !sentFolder.isEmpty()) { Imap im = null; try { im = new Imap(c); im.append(sentFolder, "\\Seen", mime); } catch (Exception ex) { /* الإرسال نجح؛ تعذّر حفظ النسخة فقط */ return "{\"ok\":true,\"warn\":" + jq("أُرسلت، لكن تعذّر حفظ نسخة في المرسلة: " + msg(ex)) + "}"; } finally { if (im != null) im.close(); } }
            return "{\"ok\":true}";
        } catch (Exception e) { return err(msg(e)); }
    }
    public static String saveDraft(Conf c, String draftsFolder, List<String> to, List<String> cc, String subject, String text, String html, List<Att> atts) {
        Imap im = null;
        try {
            if (draftsFolder == null || draftsFolder.isEmpty()) return err("لا يوجد مجلد مسودات في هذا الحساب");
            String from = c.from.isEmpty() ? c.user : c.from;
            byte[] mime = buildMime(from, to == null ? new ArrayList<String>() : to, cc, subject, text, html, atts, null, null);
            im = new Imap(c); im.append(draftsFolder, "\\Draft \\Seen", mime); return "{\"ok\":true}";
        } catch (Exception e) { return err(msg(e)); } finally { if (im != null) im.close(); }
    }

    static String readAll(java.io.BufferedReader r, String code, String what) throws Exception {
        StringBuilder sb = new StringBuilder(); String l;
        while ((l = r.readLine()) != null) { sb.append(l).append('\n'); if (l.length() < 4 || l.charAt(3) != '-') break; }
        if (!sb.toString().startsWith(code)) throw new Exception(what + ": " + sb.toString().trim());
        return sb.toString();
    }
    static void put(OutputStream o, String s) throws Exception { o.write((s + "\r\n").getBytes(U8)); o.flush(); }
    static String smtp(Conf c, String from, List<String> rcpts, byte[] mime) {
        Socket sock = null;
        try {
            if (c.smtpHost.isEmpty() || c.user.isEmpty()) return "إعدادات الصادر ناقصة";
            SSLSocketFactory sf = (SSLSocketFactory) SSLSocketFactory.getDefault();
            Socket plain = new Socket(); plain.connect(new InetSocketAddress(c.smtpHost, c.smtpPort), 20000); plain.setSoTimeout(45000);
            boolean ssl = "ssl".equals(c.smtpSec) || ("auto".equals(c.smtpSec) && c.smtpPort == 465);
            sock = ssl ? Imap.tls(sf, plain, c.smtpHost, c.smtpPort) : plain; sock.setSoTimeout(45000);
            java.io.BufferedReader r = new java.io.BufferedReader(new java.io.InputStreamReader(sock.getInputStream(), L1)); OutputStream o = sock.getOutputStream();
            readAll(r, "220", "الخادم"); put(o, "EHLO prayer.local"); String caps = readAll(r, "250", "EHLO");
            if (!ssl && !"none".equals(c.smtpSec)) {
                boolean offers = caps.toUpperCase().contains("STARTTLS");
                if ("starttls".equals(c.smtpSec) && !offers) return "الخادم لا يدعم STARTTLS";
                if (offers) { put(o, "STARTTLS"); readAll(r, "220", "STARTTLS"); sock = Imap.tls(sf, sock, c.smtpHost, c.smtpPort); sock.setSoTimeout(45000); r = new java.io.BufferedReader(new java.io.InputStreamReader(sock.getInputStream(), L1)); o = sock.getOutputStream(); put(o, "EHLO prayer.local"); readAll(r, "250", "EHLO"); }
            }
            put(o, "AUTH LOGIN"); readAll(r, "334", "AUTH"); put(o, b64enc(c.user.getBytes(U8))); readAll(r, "334", "المستخدم"); put(o, b64enc(c.pass.getBytes(U8))); readAll(r, "235", "تسجيل الدخول (تحقق من كلمة المرور)");
            put(o, "MAIL FROM:<" + addrEmail(from) + ">"); readAll(r, "250", "المرسل");
            for (String a : rcpts) { put(o, "RCPT TO:<" + addrEmail(a) + ">"); readAll(r, "25", "المستلم " + a); }
            put(o, "DATA"); readAll(r, "354", "DATA");
            // dot-stuffing للأسطر التي تبدأ بنقطة
            String body = new String(mime, L1).replaceAll("(?m)^\\.", ".."); o.write(body.getBytes(L1)); o.write("\r\n.\r\n".getBytes(L1)); o.flush();
            readAll(r, "250", "الإرسال"); put(o, "QUIT"); return null;
        } catch (Exception e) { return msg(e); } finally { try { if (sock != null) sock.close(); } catch (Exception e) { /* ignore */ } }
    }
}
