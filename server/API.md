# واجهة تطبيق «تنبيهات الإدارة» — `/hrnew/mgmt/api.php`

الملف الجاهز للرفع: `server/hrnew/mgmt/api.php` (في مستودع `tareqsoft2025/tar`). لا يعدّل أي ملف آخر في النظام.

## المصادقة (لا يوجد مفتاح API)
- التطبيق يسجّل الدخول **بحساب الموظف نفسه** عبر النموذج العادي:
  1. `GET /hrnew/login.php` ← يقرأ `csrf_token` من الحقل المخفي ويحتفظ بكوكي `PHPSESSID`.
  2. `POST /hrnew/login.php` بصيغة `application/x-www-form-urlencoded`: `csrf_token`, `username`, `password`. النجاح = استجابة 3xx إلى غير `login.php`.
- بعدها كل طلب إلى `api.php` يحمل كوكي الجلسة والترويسة **`X-Requested-With: tarsof-app`** (مطلوبة؛ تحمي من CSRF لأن المتصفح لا يرسلها من موقع خارجي دون CORS).
- الصلاحيات: `userCan('mgmt_ops','view')` للقراءة، و`userCan('mgmt_ops','edit')` للكتابة.
- إن انتهت الجلسة يعيد الملف `401` ويعيد التطبيق الدخول بالبيانات المحفوظة (مشفّرة على الجهاز).

## الاستجابة
JSON دائماً: `{"ok":true,...}` أو `{"ok":false,"error":"رسالة عربية"}`.
الرموز: 400 طلب غير صالح/ترويسة ناقصة، 401 انتهت الجلسة، 403 صلاحية، 404 غير موجود، 422 فشل تحقق، 500 خطأ خادم.

## القراءة (GET)
- `?a=bootstrap` (الافتراضي) ← يعيد:
  `user{name,canEdit}`, `at`, `sessions[]`, `employees[]`, `candidates[]`, `scale[]`, `projects[]`, `actions[]`, `statuses[]`, `targets{}`.
  - `sessions[]`: `id, ref, title, session_date, issued_by, notes, status('open'|'closed'), closed_at, directives[]`
  - `directives[]`: `id, target_type, employee_id, candidate_id, target_name, target_title, project, action_type, start_date, end_date, details, hr_note, status, scale_grade, scale_level, scale_step, scale_amount, scale_currency`
  - `employees[]`: `id,name,title` — `candidates[]`: `id,name,job,decision` — `scale[]`: `id,grade,level,currency,desc,steps[8]`
  - `actions[]`: `slug,label,tone,icon,active,endOnly` — `statuses[]`: `k,label`
- `?a=expiring&cid=<دورة>&end=<YYYY-MM>` ← `cycles[], cid, months[{ym,n}], end, list[{national_id,name,title,contract_no,start,end,renewed,renew_end}]`

## الكتابة (POST JSON، الحقل `a` يحدد الإجراء)
| a | الحقول |
|---|---|
| `session_save` | `id?, title, session_date, issued_by, notes` ← `{ok,id}` |
| `session_close` / `session_reopen` / `session_delete` | `id` |
| `directive_save` | `id?` (للتعديل), `session_id`, `target_type, employee_id, candidate_id, target_name, target_title, action_type, start_date, end_date, project, details, scale_row_id, scale_step` ← `{ok,id,session_id}` |
| `directive_status` | `id, status, hr_note?` |
| `directive_delete` | `id` |

المنطق مطابق لـ `session_save.php` و`directive_save.php` (قفل الجلسة المُقفلة، اشتقاق اسم/مسمّى الموظف والمرشّح والراتب من الخادم، «انتهاء تكليف» يتطلب تاريخ نهاية ولا يحفظ تاريخ بداية، `logAction`).

## ما يعتمد عليه الملف في النظام (تغييره قد يكسر التطبيق)
- جداول وأعمدة: `mgmt_sessions`, `mgmt_directives` (الأعمدة أعلاه + `created_by`), `employees(id,name_ar,job_title)`, `recruitment_candidates`, `recruitments`, `salary_scale_rows(step1..step8,...)`, `payroll_rows(project,...)`, `payroll_cycles`.
- دوال `includes/mgmt_ops.php`: `mgmt_action_types(bool)`, `mgmt_end_only_slugs()`, `mgmt_statuses()`, `mgmt_target_types()`, `mgmt_mark_renewed()`.
- مفاتيح مصفوفة الأنواع: `label, tone, icon`؛ والحالات: `label`.
- قيم `status` المستعملة: `new`, `in_progress`, `done`؛ والجلسة: `open`, `closed`.

## الوحدات والسلة (لأي مستخدم مسجَّل دخوله)
- `GET ?a=modules` ← `modules[{key,label,icon,enabled,badge}]`: الوحدات التي يعرضها التطبيق في شريطه (`mgmt` و`basket` حالياً). وحدة جديدة تظهر في التطبيق دون تحديثه، وغير المعروفة تُعرض برسالة «غير مدعومة في هذا الإصدار».
- `GET ?a=basket` ← `items[]` (`id, basket_id, source, source_ref, title, subject, details, due_date, status, result_note, done_at, basket_title, basket_note, sent_at, from`) و`statuses[{k,label}]`.
- `POST {a:'basket_item_status', id, status, result_note?}` ← تحديث حالة مهمة تخصّ المستخدم (والحالة `done` تُغلق السلة إن لم يبقَ شيء).

## الحقول الإضافية والمخطط
- كل عمود جديد في `mgmt_directives` أو `mgmt_sessions` يظهر في `extra` لكل توجيه/جلسة وفي `schema.directive` / `schema.session` (`k, type, label, extra`) وتسميته من تعليق العمود (COMMENT).
- يعرضه التطبيق تلقائياً في البطاقة ويحرّره في النموذج، ويُرسَل في `extra` عند `directive_save` و`session_save`.
- `schema_version` يتغيّر كلما تغيّر المخطط، و`theme` ألوان ونغمات الأنواع (التطبيق يقرأ الأنواع من `actions`).

## ملاحظة
هذه الواجهة لا تستعمل مفتاح API. إن رغبتم بمفتاح بدل حساب المستخدم فهذا تغيير في الواجهة والتطبيق معاً، ولا يُنفَّذ إلا بطلب صريح.
