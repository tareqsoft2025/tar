package com.tareqsoft.prayer;

import android.content.Context;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** جسر بين الواجهة وMailCore: يبني الإعدادات من الحساب المحفوظ وينفّذ العملية المطلوبة. */
final class MailOps {
    private MailOps() { }

    static MailCore.Conf conf(Context c) throws Exception {
        JSONObject o = new JSONObject(MailSender.sp(c).getString("cfg", "{}"));
        MailCore.Conf k = new MailCore.Conf();
        k.user = o.optString("user", ""); k.from = o.optString("from", k.user); k.pass = ErpClient.decText(MailSender.sp(c).getString("pw", ""));
        k.imapHost = o.optString("imapHost", ""); k.imapPort = o.optInt("imapPort", 143); k.imapSec = o.optString("imapSec", "auto");
        k.smtpHost = o.optString("host", ""); k.smtpPort = o.optInt("port", 587); k.smtpSec = o.optString("sec", "auto");
        if (k.user.isEmpty() || k.pass.isEmpty() || k.imapHost.isEmpty()) throw new Exception("أكمل إعدادات الحساب أولاً (البريد وكلمة المرور وخادم الوارد)");
        return k;
    }
    static List<String> strs(JSONArray a) { List<String> l = new ArrayList<String>(); if (a != null) for (int i = 0; i < a.length(); i++) { String s = a.optString(i, "").trim(); if (!s.isEmpty()) l.add(s); } return l; }
    static long[] longs(JSONArray a) { long[] r = new long[a == null ? 0 : a.length()]; for (int i = 0; i < r.length; i++) r[i] = a.optLong(i); return r; }
    static List<MailCore.Att> atts(JSONArray a) {
        List<MailCore.Att> l = new ArrayList<MailCore.Att>(); if (a == null) return l;
        for (int i = 0; i < a.length(); i++) { JSONObject x = a.optJSONObject(i); if (x == null) continue; MailCore.Att t = new MailCore.Att(); t.name = x.optString("name", "file"); t.type = x.optString("type", "application/octet-stream"); t.data = MailCore.b64dec(x.optString("b64", "")); l.add(t); }
        return l;
    }

    static String run(Context c, String json) throws Exception {
        JSONObject r = new JSONObject(json); String op = r.optString("op"); MailCore.Conf k = conf(c);
        if (op.equals("folders")) return MailCore.folders(k);
        if (op.equals("list")) return MailCore.list(k, r.getString("folder"), r.optInt("offset", 0), r.optInt("size", 30), r.optString("q", ""), r.optBoolean("unseen", false));
        if (op.equals("get")) return MailCore.get(k, r.getString("folder"), r.getLong("uid"));
        if (op.equals("att")) return MailCore.attachment(k, r.getString("folder"), r.getLong("uid"), r.getInt("idx"));
        if (op.equals("flag")) return MailCore.flag(k, r.getString("folder"), longs(r.optJSONArray("uids")), r.optBoolean("add", true), r.getString("flag"));
        if (op.equals("move")) return MailCore.move(k, r.getString("folder"), longs(r.optJSONArray("uids")), r.getString("dest"));
        if (op.equals("delete")) return MailCore.delete(k, r.getString("folder"), longs(r.optJSONArray("uids")), r.optString("trash", ""), r.optBoolean("permanent", false));
        if (op.equals("create")) return MailCore.createFolder(k, r.getString("name"));
        if (op.equals("empty")) return MailCore.emptyFolder(k, r.getString("folder"));
        if (op.equals("send")) return MailCore.send(k, strs(r.optJSONArray("to")), strs(r.optJSONArray("cc")), strs(r.optJSONArray("bcc")), r.optString("subject", ""), r.optString("text", ""), r.optString("html", ""), atts(r.optJSONArray("atts")), r.optString("inReplyTo", ""), r.optString("refs", ""), r.optString("sentFolder", ""));
        if (op.equals("draft")) return MailCore.saveDraft(k, r.optString("draftsFolder", ""), strs(r.optJSONArray("to")), strs(r.optJSONArray("cc")), r.optString("subject", ""), r.optString("text", ""), r.optString("html", ""), atts(r.optJSONArray("atts")));
        return MailCore.err("عملية غير معروفة");
    }
}
