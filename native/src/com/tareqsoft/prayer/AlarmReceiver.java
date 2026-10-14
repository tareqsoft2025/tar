package com.tareqsoft.prayer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String chk = i.getStringExtra("chk");
        if (chk != null && Scheduler.isLogged(c, chk)) return; // الصلاة مسجّلة: لا حاجة للتذكير
        Scheduler.notifyNow(c, i.getIntExtra("id", 0), i.getStringExtra("title"), i.getStringExtra("body"), i.getStringExtra("tab"));
    }
}
