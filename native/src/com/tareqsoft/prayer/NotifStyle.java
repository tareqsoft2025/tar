package com.tareqsoft.prayer;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;

/** مظهر موحّد لكل إشعارات التطبيق: أيقونة شريط حالة مخصّصة، لون الهوية، عنوان فرعي، وقت، وأيقونة كبيرة. */
final class NotifStyle {
    static final int GOLD = 0xFFC9A24D;
    private static Bitmap big;

    private NotifStyle() {}

    private static Bitmap large(Context c) {
        if (big == null) {
            try {
                Bitmap b = BitmapFactory.decodeResource(c.getResources(), R.mipmap.ic_launcher);
                if (b != null) big = Bitmap.createScaledBitmap(b, 128, 128, true);
            } catch (Throwable t) { /* بدون أيقونة كبيرة */ }
        }
        return big;
    }

    /** icon: مورد أيقونة شريط الحالة؛ sub: عنوان فرعي (يظهر بجانب اسم التطبيق)؛ withLarge: أيقونة التطبيق الكبيرة. */
    static Notification.Builder apply(Notification.Builder nb, Context c, int icon, String sub, boolean withLarge) {
        nb.setSmallIcon(icon).setColor(GOLD).setShowWhen(true);
        if (sub != null) nb.setSubText(sub);
        if (withLarge) { Bitmap b = large(c); if (b != null) nb.setLargeIcon(b); }
        return nb;
    }

    /** تجميع الإشعارات المتشابهة (طلبات/حضور) في مجموعة واحدة قابلة للطي مع ملخص. */
    static void group(Context c, NotificationManager nm, Notification.Builder nb, String key, int summaryId, String channel, String title, int icon) {
        nb.setGroup(key);
        Notification.Builder sb = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, channel) : new Notification.Builder(c);
        sb.setSmallIcon(icon).setColor(GOLD).setContentTitle(title).setGroup(key).setGroupSummary(true).setAutoCancel(true).setShowWhen(true);
        nm.notify(summaryId, sb.build());
    }
}
