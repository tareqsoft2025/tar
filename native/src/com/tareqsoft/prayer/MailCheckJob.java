package com.tareqsoft.prayer;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import java.util.List;

/** فحص دوري (كل 15 دقيقة) للوارد عبر IMAP لإظهار منبثق بالبريد الجديد، حتى والتطبيق مغلق. */
public class MailCheckJob extends JobService {
    static final int JOB_ID = 7313;

    static void arm(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (!MailSender.notifyEnabled(c)) { js.cancel(JOB_ID); return; }
        js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, MailCheckJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15 * 60_000L).setPersisted(true).build());
    }

    @Override public boolean onStartJob(final JobParameters p) {
        if (!MailSender.notifyEnabled(this)) return false;
        new Thread(new Runnable() { public void run() {
            try { List<MailInbox.Msg> l = MailInbox.check(getApplicationContext()); MailInbox.notifyNew(getApplicationContext(), l); }
            catch (Exception e) { /* المحاولة التالية بعد 15 دقيقة */ }
            jobFinished(p, false);
        } }).start();
        return true;
    }

    @Override public boolean onStopJob(JobParameters p) { return true; }
}
