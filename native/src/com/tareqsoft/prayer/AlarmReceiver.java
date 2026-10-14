package com.tareqsoft.prayer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        Scheduler.notifyNow(c, i.getIntExtra("id", 0), i.getStringExtra("title"), i.getStringExtra("body"));
    }
}
