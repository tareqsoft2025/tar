package com.tareqsoft.prayer;

import android.content.Context;
import android.util.Base64;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import org.json.JSONObject;

/**
 * خريطة دون إنترنت: ملف PMTiles (بلاطات متجهة من OpenStreetMap) يُنزَّل مرة واحدة إلى ملفات التطبيق،
 * وتقرأ الصفحة منه أجزاء صغيرة عبر الجسر (mapRead) فتُرسم الخريطة محلياً دون إنترنت.
 */
final class OfflineMap {
    static final String NAME = "gaza.pmtiles";
    private static final long MIN_SIZE = 1_000_000L;
    private static RandomAccessFile raf;
    private static volatile boolean downloading = false;

    private OfflineMap() {}

    interface Progress { void on(int pct); }

    static File file(Context c) {
        File d = new File(c.getFilesDir(), "maps");
        d.mkdirs();
        return new File(d, NAME);
    }

    static synchronized String info(Context c) {
        File f = file(c);
        JSONObject o = new JSONObject();
        try {
            o.put("have", f.exists() && f.length() > MIN_SIZE);
            o.put("size", f.exists() ? f.length() : 0);
            o.put("downloading", downloading);
        } catch (Exception e) { /* ignore */ }
        return o.toString();
    }

    /** يقرأ جزءاً من الملف ويعيده Base64 (فارغ عند الخطأ). */
    static synchronized String read(Context c, long off, int len) {
        try {
            if (off < 0 || len <= 0 || len > 4 * 1024 * 1024) return "";
            if (raf == null) {
                File f = file(c);
                if (!f.exists()) return "";
                raf = new RandomAccessFile(f, "r");
            }
            long size = raf.length();
            if (off >= size) return "";
            int n = (int) Math.min((long) len, size - off);
            byte[] buf = new byte[n];
            raf.seek(off);
            raf.readFully(buf);
            return Base64.encodeToString(buf, Base64.NO_WRAP);
        } catch (Exception e) {
            closeQuietly();
            return "";
        }
    }

    private static void closeQuietly() {
        try { if (raf != null) raf.close(); } catch (Exception e) { /* ignore */ }
        raf = null;
    }

    static synchronized void delete(Context c) {
        closeQuietly();
        file(c).delete();
    }

    /** ينزّل الملف إلى ملف مؤقت ولا يعتمده إلا بعد اكتماله والتحقق من ترويسته. يعيد null عند النجاح أو رسالة الخطأ. */
    static String download(Context c, String url, Progress p) {
        if (url == null || !url.startsWith(UpdateChecker.APK_PREFIX) || !url.endsWith(".pmtiles")) return "رابط غير موثوق";
        synchronized (OfflineMap.class) {
            if (downloading) return "التنزيل جارٍ بالفعل";
            downloading = true;
        }
        File tmp = new File(file(c).getParentFile(), NAME + ".part");
        File tagf = new File(file(c).getParentFile(), NAME + ".part.etag");
        try {
            // تنزيل قابل للاستكمال: عند انقطاع الاتصال (2G) نكمل من حيث توقف بدل البدء من الصفر
            long total = -1, done = tmp.exists() ? tmp.length() : 0;
            String etag = null;
            try { if (tagf.exists()) { java.io.BufferedReader br = new java.io.BufferedReader(new java.io.FileReader(tagf)); etag = br.readLine(); br.close(); } } catch (Exception e) { etag = null; }
            if (etag == null && done > 0) { tmp.delete(); done = 0; }
            int last = -1, fails = 0;
            while (total < 0 || done < total) {
                HttpURLConnection con = null;
                try {
                    con = (HttpURLConnection) new java.net.URL(url).openConnection();
                    con.setConnectTimeout(25000);
                    con.setReadTimeout(60000);
                    con.setRequestProperty("Accept-Encoding", "identity");
                    if (done > 0) { con.setRequestProperty("Range", "bytes=" + done + "-"); if (etag != null) con.setRequestProperty("If-Range", etag); }
                    int code = con.getResponseCode();
                    if (code == 416) { tmp.delete(); tagf.delete(); done = 0; total = -1; etag = null; if (++fails > 40) return "فشل التنزيل، حاول مجدداً"; continue; }
                    if (code != 200 && code != 206) throw new java.io.IOException("http " + code);
                    if (code == 200 && done > 0) { done = 0; tmp.delete(); } // الخادم تجاهل Range أو تغيّر الملف
                    String tag = con.getHeaderField("ETag");
                    if (code == 200) {
                        total = con.getContentLengthLong();
                        etag = tag;
                        if (etag != null) { java.io.FileWriter fw = new java.io.FileWriter(tagf); fw.write(etag); fw.close(); }
                    } else {
                        String cr = con.getHeaderField("Content-Range"); // bytes a-b/total
                        if (cr != null && cr.indexOf('/') > 0) total = Long.parseLong(cr.substring(cr.indexOf('/') + 1).trim());
                    }
                    InputStream in = con.getInputStream();
                    FileOutputStream out = new FileOutputStream(tmp, done > 0);
                    byte[] buf = new byte[32768];
                    int n;
                    try {
                        while ((n = in.read(buf)) > 0) {
                            out.write(buf, 0, n);
                            done += n;
                            fails = 0;
                            int pct = total > 0 ? (int) (done * 100 / total) : 0;
                            if (p != null && pct != last) { last = pct; p.on(pct); }
                        }
                    } finally { out.close(); in.close(); }
                    if (total < 0) total = done;
                } catch (Exception e) {
                    if (++fails > 40) return "فشل التنزيل، تحقق من الإنترنت وحاول مجدداً (سيُستكمل من حيث توقف)";
                    done = tmp.exists() ? tmp.length() : 0;
                    try { Thread.sleep(Math.min(30000, 2000L * fails)); } catch (InterruptedException ie) { return "أُلغي التنزيل"; }
                } finally { if (con != null) con.disconnect(); }
            }
            tagf.delete();
            if (done < MIN_SIZE || (total > 0 && done != total)) { tmp.delete(); return "التنزيل غير مكتمل، حاول مجدداً"; }
            RandomAccessFile chk = new RandomAccessFile(tmp, "r");
            byte[] magic = new byte[7];
            chk.readFully(magic);
            chk.close();
            if (!"PMTiles".equals(new String(magic, "US-ASCII"))) { tmp.delete(); return "الملف المنزَّل غير صالح"; }
            synchronized (OfflineMap.class) {
                closeQuietly();
                File f = file(c);
                f.delete();
                if (!tmp.renameTo(f)) return "تعذّر حفظ الخريطة";
            }
            return null;
        } catch (Exception e) {
            tmp.delete();
            return "فشل التنزيل، تحقق من الإنترنت وحاول مجدداً";
        } finally { downloading = false; }
    }
}
