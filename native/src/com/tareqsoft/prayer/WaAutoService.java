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
    static volatile String state = "idle";   // idle | waiting | sent | timeout
    private final Handler h = new Handler(Looper.getMainLooper());
    private long lastTry = 0;

    static void arm(long ms) { state = "waiting"; armUntil = System.currentTimeMillis() + ms; }
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
        AccessibilityNodeInfo n = findSend(root, p);
        if (n != null && click(n)) {
            state = "sent"; armUntil = 0;
            h.postDelayed(new Runnable() { public void run() {
                try { startActivity(new Intent(WaAutoService.this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)); } catch (Exception e) { /* ignore */ }
            } }, 2200);
        }
    }

    private AccessibilityNodeInfo findSend(AccessibilityNodeInfo root, String pkg) {
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
        for (int i = 0; i < 4 && c != null; i++) {
            if (c.isClickable() && c.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
            c = c.getParent();
        }
        return false;
    }

    @Override public void onInterrupt() { /* لا شيء */ }
}
