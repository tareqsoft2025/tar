package com.tareqsoft.prayer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String m = i.getStringExtra("mosque");
        if (m != null) { Scheduler.mosque(c, "on".equals(m)); return; }
        Scheduler.notifyNow(c, i.getIntExtra("id", 0), i.getStringExtra("title"), i.getStringExtra("body"), i.getStringExtra("tab"), i.getStringExtra("snd"));
    }
}
