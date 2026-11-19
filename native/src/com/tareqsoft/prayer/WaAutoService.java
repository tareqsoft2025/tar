package com.tareqsoft.prayer;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.List;

/**
 * إرسال تلقائي لملف إلى محادثة واتساب بعد أن يفتحها التطبيق بالملف جاهزاً: يضغط زر «إرسال» نيابةً عن المستخدم.
 * لا يعمل إلا إذا فعّله المستخدم يدوياً من «إمكانية الوصول»، ولا يتصرف إلا خلال نافذة قصيرة يفتحها التطبيق نفسه
 * (arm) وفي واتساب فقط (com.whatsapp / com.whatsapp.w4b)، ثم يعيد التطبيق إلى الواجهة.
 */
public class WaAutoService extends AccessibilityService {
    static volatile long armUntil = 0;
    static volatile String caption = null;   // نص يُكتب في خانة الشرح قبل الإرسال (إن وُجدت)
    static volatile int capTries = 0;
    static volatile String state = "idle";   // idle | waiting | sent | timeout
    private final Handler h = new Handler(Looper.getMainLooper());
    private long lastTry = 0;

    static void arm(long ms) { state = "waiting"; capTries = 0; armUntil = System.currentTimeMillis() + ms; }
    static String status() {
        if ("waiting".equals(state) && System.currentTimeMillis() > armUntil) state = "timeout";
        return state;
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent ev) {
        if (ev == null || !"waiting".equals(state)) return;
        long now = System.currentTimeMillis();
        if (now > armUntil) { state = "timeout"; return; }
        CharSequence pk = ev.getPackageName();
        if (pk == null) return;
        String p = pk.toString();
        if (!p.equals("com.whatsapp") && !p.equals("com.whatsapp.w4b")) return;
        if (now - lastTry < 350) return;      // لا نكثّف المحاولات
        lastTry = now;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;
        // اكتب شرح الملف (مرفق التقرير اليومي + الوقت) في خانة الشرح قبل الضغط على إرسال
        if (caption != null && capTries < 5) {
            AccessibilityNodeInfo ed = findCaption(root, 0);
            if (ed != null) {
                CharSequence cur = ed.getText();
                boolean empty = cur == null || cur.length() == 0;
                if (!empty && android.os.Build.VERSION.SDK_INT >= 26 && ed.getHintText() != null && cur.toString().contentEquals(ed.getHintText())) empty = true;
                capTries++;
                if (empty) {
                    android.os.Bundle ab = new android.os.Bundle();
                    ab.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, caption);
                    if (ed.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, ab)) { lastTry = 0; return; }   // نترك الحدث التالي للضغط
                }
            } else capTries++;
        }
        AccessibilityNodeInfo n = findSend(root, p);
        if (n != null && click(n)) {
            state = "sent"; armUntil = 0;
            h.postDelayed(new Runnable() { public void run() {
                if (AutoReport.queueActive()) { AutoReport.onSent(getApplicationContext()); return; }   // التقرير اليومي: المستلم التالي
                try { startActivity(new Intent(WaAutoService.this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)); } catch (Exception e) { /* ignore */ }
            } }, 2500);
        }
    }

    /** بحث شامل في الشجرة: عقدة معرّفها send أو وصفها «إرسال/Send» وقابلة للنقر (زر معاينة المستند والصور). */
    private AccessibilityNodeInfo walk(AccessibilityNodeInfo n, int depth) {
        if (n == null || depth > 30) return null;
        try {
            CharSequence id = n.getViewIdResourceName(), d = n.getContentDescription();
            String ids = id == null ? "" : id.toString(), ds = d == null ? "" : d.toString().trim();
            boolean hit = ids.endsWith(":id/send") || ds.equals("إرسال") || ds.equals("ارسال") || ds.equalsIgnoreCase("send");
            if (hit && n.isVisibleToUser() && n.isEnabled()) return n;
            for (int i = 0; i < n.getChildCount(); i++) { AccessibilityNodeInfo r = walk(n.getChild(i), depth + 1); if (r != null) return r; }
        } catch (Exception e) { /* تابع */ }
        return null;
    }

    private AccessibilityNodeInfo findCaption(AccessibilityNodeInfo n, int depth) {
        if (n == null || depth > 30) return null;
        try {
            CharSequence cn = n.getClassName(), id = n.getViewIdResourceName();
            String ids = id == null ? "" : id.toString();
            if (cn != null && cn.toString().endsWith("EditText") && n.isVisibleToUser() && (ids.isEmpty() || ids.endsWith(":id/caption") || ids.endsWith(":id/entry"))) return n;
            for (int i = 0; i < n.getChildCount(); i++) { AccessibilityNodeInfo r = findCaption(n.getChild(i), depth + 1); if (r != null) return r; }
        } catch (Exception e) { /* تابع */ }
        return null;
    }

    private AccessibilityNodeInfo findSend(AccessibilityNodeInfo root, String pkg) {
        AccessibilityNodeInfo wk = walk(root, 0);
        if (wk != null) return wk;
        try {
            List<AccessibilityNodeInfo> l = root.findAccessibilityNodeInfosByViewId(pkg + ":id/send");
            if (l != null) for (AccessibilityNodeInfo x : l) if (x.isEnabled() && x.isVisibleToUser()) return x;
        } catch (Exception e) { /* ننتقل للبحث بالنص */ }
        String[] words = { "إرسال", "Send", "ارسال" };
        for (String w : words) {
            List<AccessibilityNodeInfo> l = root.findAccessibilityNodeInfosByText(w);
            if (l == null) continue;
            for (AccessibilityNodeInfo x : l) {
                CharSequence t = x.getText(), d = x.getContentDescription();
                String s = ((t == null ? "" : t.toString()) + "|" + (d == null ? "" : d.toString()));
                boolean exact = s.equals(w + "|") || s.equals("|" + w) || s.equals(w + "|" + w);
                if (exact && x.isEnabled() && x.isVisibleToUser()) return x;
            }
        }
        return null;
    }

    private boolean click(AccessibilityNodeInfo n) {
        AccessibilityNodeInfo c = n;
        for (int i = 0; i < 5 && c != null; i++) {
            if (c.isClickable() && c.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
            c = c.getParent();
        }
        // احتياطي: نقرة بالإحداثيات على منتصف الزر
        try {
            if (android.os.Build.VERSION.SDK_INT >= 24) {
                android.graphics.Rect r = new android.graphics.Rect(); n.getBoundsInScreen(r);
                if (r.width() > 0 && r.height() > 0) {
                    android.graphics.Path path = new android.graphics.Path(); path.moveTo(r.exactCenterX(), r.exactCenterY());
                    android.accessibilityservice.GestureDescription.Builder b = new android.accessibilityservice.GestureDescription.Builder();
                    b.addStroke(new android.accessibilityservice.GestureDescription.StrokeDescription(path, 0, 80));
                    return dispatchGesture(b.build(), null, null);
                }
            }
        } catch (Exception e) { /* ignore */ }
        return false;
    }

    @Override public void onInterrupt() { /* لا شيء */ }
}
