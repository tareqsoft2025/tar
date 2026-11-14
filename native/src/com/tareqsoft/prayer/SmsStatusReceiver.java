package com.tareqsoft.prayer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Receives the per-part "sent" result of messages sent by SmsSender. */
public class SmsStatusReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent in) {
        if (in == null || !SmsSender.ACTION.equals(in.getAction())) return;
        SmsSender.record(c, in.getIntExtra("id", -1), in.getIntExtra("total", 1), getResultCode());
    }
}
