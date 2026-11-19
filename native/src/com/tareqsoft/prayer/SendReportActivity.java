package com.tareqsoft.prayer;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Bundle;

/** شفافة بلا واجهة: تُفتح من زر «إرسال» في إشعار التقرير اليومي، فتبدأ إرسال الملف الجاهز إلى واتساب ثم تُغلق. */
public class SendReportActivity extends Activity {
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).cancel(AutoReport.NOTIF_ID);
        AutoReport.sendPrepared(this);
        finish();
    }
}
