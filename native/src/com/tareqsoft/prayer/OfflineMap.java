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
        try {
            HttpURLConnection con = UpdateChecker.open(url, 15000);
            int total = con.getContentLength();
            InputStream in = con.getInputStream();
            FileOutputStream out = new FileOutputStream(tmp);
            byte[] buf = new byte[32768];
            long done = 0;
            int n, last = -1;
            try {
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    done += n;
                    int pct = total > 0 ? (int) (done * 100 / total) : 0;
                    if (p != null && pct != last) { last = pct; p.on(pct); }
                }
            } finally { out.close(); in.close(); }
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
