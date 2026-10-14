package com.tareqsoft.prayer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Fires right after each prayer time: refreshes the widget and the lock-screen countdown. */
public class TickReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        Scheduler.refreshAll(c);
    }
}
