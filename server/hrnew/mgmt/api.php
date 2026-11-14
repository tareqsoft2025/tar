<?php
/**
 * واجهة JSON لتطبيق الجوال — «عمليات الإدارة / تنبيهات الإدارة».
 *
 * تُرفع إلى: /hrnew/mgmt/api.php   (بجانب index.php)
 *
 * - الجلسة: نفس جلسة نظام الموارد البشرية (PHPSESSID) بعد تسجيل الدخول من /hrnew/login.php.
 * - الصلاحيات: نفس صلاحية mgmt_ops (عرض / تعديل) المستعملة في index.php وملفات الحفظ.
 * - الحماية من CSRF: تُقبل الطلبات فقط مع الترويسة X-Requested-With: tarsof-app
 *   (لا يمكن لموقع خارجي إرسالها من المتصفح دون تصريح CORS)، وتُرسل الكتابة بصيغة JSON.
 * - لا تُغيّر هذه الواجهة أي ملف آخر؛ المنطق نفسه الموجود في session_save.php و directive_save.php.
 *
 * ⚠ مربوطة بتطبيق «تنبيهات الإدارة» (APK). أي تعديل على جداول mgmt_* أو includes/mgmt_ops.php
 *   أو أسماء الحقول أدناه يجب أن يحافظ على عقد هذه الواجهة، وإلا تعطّل التطبيق المنشور.
 */
declare(strict_types=1);

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/mgmt_ops.php';
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function api_out(int $code, array $data): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
}
function api_fail(string $msg, int $code = 422): void
{
    api_out($code, ['ok' => false, 'error' => $msg]);
}

set_exception_handler(static function (Throwable $e): void {
    error_log('mgmt api: ' . $e->getMessage());
    api_out(500, ['ok' => false, 'error' => 'خطأ في الخادم، حاول لاحقاً.']);
});

if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'tarsof-app') {
    api_fail('طلب غير مصرّح به.', 400);
}
$user = currentUser();
if (!$user) {
    api_fail('انتهت الجلسة، سجّل الدخول من جديد.', 401);
}
// صلاحية عمليات الإدارة تُفحص بعد تحديد الإجراء: وحدات السلة متاحة لأي مستخدم مسجَّل دخوله.
$canView = userCan('mgmt_ops', 'view');
$canEdit = userCan('mgmt_ops', 'edit');

$pdo    = db();
$method = $_SERVER['REQUEST_METHOD'];
$body   = [];
if ($method === 'POST') {
    $raw  = file_get_contents('php://input');
    $body = $raw !== '' && $raw !== false ? json_decode($raw, true) : [];
    if (!is_array($body)) api_fail('بيانات غير صالحة.', 400);
}
$a = (string) ($method === 'POST' ? ($body['a'] ?? '') : ($_GET['a'] ?? 'bootstrap'));

/* ───────────────────────── الوحدات والسلة (لأي مستخدم مسجَّل) ─────────────────────────
 * modules: قائمة الوحدات التي يعرضها التطبيق في شريطه — تُضاف وحدةٌ جديدة هنا من الخادم فتظهر في التطبيق دون إعادة بنائه
 *          (إن كان يرسم شريطه من هذه القائمة ويعرف فتح الوحدة من مفتاحها).
 * basket: مهامّ السلة المُرسلة إلى المستخدم. basket_item_status: تحديث حالة مهمة ومتابعتها.
 */
if (in_array($a, ['modules', 'basket', 'basket_item_status'], true)) {
    require_once __DIR__ . '/../includes/basket.php';
    basket_ensure($pdo);
    $uid = (int) $user['id'];
    if ($a === 'modules') {
        $bk = basket_counts($pdo, $uid);
        api_out(200, ['ok' => true, 'at' => time(), 'modules' => [
            ['key' => 'mgmt', 'label' => 'عمليات الإدارة', 'icon' => 'bi-clipboard2-pulse', 'enabled' => $canView, 'badge' => 0],
            ['key' => 'basket', 'label' => 'السلة', 'icon' => 'bi-basket3', 'enabled' => true, 'badge' => (int) $bk['todo']],
        ]]);
    }
    if ($a === 'basket') {
        $q = $pdo->prepare("SELECT i.id, i.basket_id, i.source, i.source_ref, i.title, i.subject, i.details, i.due_date, i.status, i.result_note, i.done_at,
                b.title basket_title, b.note basket_note, b.sent_at, b.status basket_status, uo.full_name from_name
            FROM hr_basket_items i JOIN hr_baskets b ON b.id = i.basket_id LEFT JOIN users uo ON uo.id = b.owner_user_id
            WHERE b.assignee_user_id = :u AND b.status IN ('sent','closed') ORDER BY (i.status = 'done'), b.id DESC, i.id");
        $q->execute(['u' => $uid]);
        $items = [];
        foreach ($q->fetchAll() as $r) {
            $items[] = ['id' => (int) $r['id'], 'basket_id' => (int) $r['basket_id'], 'source' => $r['source'], 'source_ref' => $r['source_ref'], 'title' => $r['title'],
                'subject' => $r['subject'], 'details' => $r['details'], 'due_date' => $r['due_date'], 'status' => $r['status'], 'result_note' => $r['result_note'],
                'done_at' => $r['done_at'], 'basket_title' => $r['basket_title'], 'basket_note' => $r['basket_note'], 'sent_at' => $r['sent_at'], 'from' => $r['from_name']];
        }
        $sts = [];
        foreach (basket_statuses() as $k => $v) { $sts[] = ['k' => $k, 'label' => $v[0]]; }
        api_out(200, ['ok' => true, 'at' => time(), 'items' => $items, 'statuses' => $sts]);
    }
    // basket_item_status
    if ($method !== 'POST') api_fail('إجراء غير معروف.', 400);
    $iid = (int) ($body['id'] ?? 0);
    $st = (string) ($body['status'] ?? '');
    if (!isset(basket_statuses()[$st])) api_fail('حالة غير صالحة.');
    $q = $pdo->prepare("SELECT i.id, b.id bid FROM hr_basket_items i JOIN hr_baskets b ON b.id = i.basket_id WHERE i.id = :i AND b.assignee_user_id = :u AND b.status = 'sent'");
    $q->execute(['i' => $iid, 'u' => $uid]);
    $row = $q->fetch();
    if (!$row) api_fail('المهمة غير موجودة أو ليست لك.', 404);
    $note = array_key_exists('result_note', $body) ? (trim((string) $body['result_note']) ?: null) : null;
    $pdo->prepare('UPDATE hr_basket_items SET status = :s, result_note = COALESCE(:n, result_note), done_at = :d, done_by = :b WHERE id = :i')
        ->execute(['s' => $st, 'n' => $note, 'd' => $st === 'done' ? date('Y-m-d H:i:s') : null, 'b' => $st === 'done' ? $uid : null, 'i' => $iid]);
    $left = $pdo->prepare("SELECT COUNT(*) FROM hr_basket_items WHERE basket_id = :b AND status <> 'done'");
    $left->execute(['b' => (int) $row['bid']]);
    if ((int) $left->fetchColumn() === 0) { $pdo->prepare("UPDATE hr_baskets SET status = 'closed' WHERE id = :b")->execute(['b' => (int) $row['bid']]); }
    logAction('update', 'basket', 'basket_item', $iid, 'status=' . $st . ' (app)');
    api_out(200, ['ok' => true, 'id' => $iid, 'status' => $st]);
}
if (!$canView) {
    api_fail('لا تملك صلاحية عمليات الإدارة.', 403);
}

function mgmt_ref_of(array $s): string
{
    return 'مج/' . date('Y', strtotime((string) $s['session_date'])) . '/' . str_pad((string) $s['id'], 3, '0', STR_PAD_LEFT);
}
function api_session_of(PDO $pdo, int $directiveId): ?int
{
    $st = $pdo->prepare('SELECT session_id FROM mgmt_directives WHERE id = :i');
    $st->execute(['i' => $directiveId]);
    $v = $st->fetchColumn();
    return $v === false ? null : (int) $v;
}
function api_guard_open(PDO $pdo, int $sessionId): void
{
    $st = $pdo->prepare('SELECT status FROM mgmt_sessions WHERE id = :i');
    $st->execute(['i' => $sessionId]);
    if ($st->fetchColumn() === 'closed') api_fail('الجلسة مُقفلة — أعِد فتحها أولاً.');
}
/**
 * الأعمدة المعروفة للتطبيق الحالي. أي عمود جديد يُضاف إلى الجدول لاحقاً يظهر تلقائياً في الحقل «extra» وفي «schema»،
 * وتسميته من تعليق العمود (COMMENT) في القاعدة، فيعرضه كل تطبيق يقرأ المخطط دون تغيير هذا الملف.
 */
const API_KNOWN_DIR = ['id','session_id','target_type','employee_id','candidate_id','target_name','target_title','project','action_type','start_date','end_date','details','hr_note','status','scale_grade','scale_level','scale_step','scale_amount','scale_currency','created_by','created_at','updated_at'];
const API_KNOWN_SES = ['id','title','session_date','issued_by','notes','status','closed_at','closed_by','created_by','created_at','updated_at'];
const API_HIDDEN = ['created_by','created_at','updated_at','closed_by'];

/** أعمدة جدول بنوعها المبسّط وتسميتها (التعليق). @return array<string,array{type:string,label:string,null:bool}> */
function api_columns(PDO $pdo, string $table): array
{
    static $cache = [];
    if (isset($cache[$table])) return $cache[$table];
    $out = [];
    foreach ($pdo->query('SHOW FULL COLUMNS FROM ' . $table) as $c) {
        $t = strtolower((string) $c['Type']);
        if (str_contains($t, 'int')) { $type = 'int'; }
        elseif (preg_match('/decimal|float|double/', $t)) { $type = 'number'; }
        elseif (str_starts_with($t, 'datetime') || str_starts_with($t, 'timestamp')) { $type = 'datetime'; }
        elseif (str_starts_with($t, 'date')) { $type = 'date'; }
        elseif (str_contains($t, 'text')) { $type = 'text'; }
        else { $type = 'string'; }
        $out[(string) $c['Field']] = ['type' => $type, 'label' => trim((string) $c['Comment']), 'null' => $c['Null'] === 'YES'];
    }
    return $cache[$table] = $out;
}
/** قيمة عمودٍ إضافي بنوعها الصحيح للتطبيق. */
function api_cast($v, string $type)
{
    if ($v === null) return null;
    return $type === 'int' ? (int) $v : ($type === 'number' ? (float) $v : (string) $v);
}
/** الأعمدة الإضافية في صفٍّ: كل ما ليس في المعروف ولا مخفياً. */
function api_extra(PDO $pdo, string $table, array $known, array $row): array
{
    $x = [];
    foreach (api_columns($pdo, $table) as $col => $m) {
        if (in_array($col, $known, true) || in_array($col, API_HIDDEN, true)) continue;
        $x[$col] = api_cast($row[$col] ?? null, $m['type']);
    }
    return $x;
}
/** يقرأ extra من الطلب ويُرجع [عمود => قيمة] للأعمدة الإضافية الموجودة فعلاً فقط (قائمة بيضاء من القاعدة نفسها). */
function api_extra_in(PDO $pdo, string $table, array $known, $in): array
{
    $o = [];
    if (!is_array($in)) return $o;
    foreach (api_columns($pdo, $table) as $col => $m) {
        if (in_array($col, $known, true) || in_array($col, API_HIDDEN, true) || !array_key_exists($col, $in)) continue;
        $v = $in[$col];
        if (is_array($v) || is_object($v)) continue;
        $v = $v === null ? null : trim((string) $v);
        if ($v === '') $v = null;
        if ($v !== null && $m['type'] === 'int') $v = (string) (int) $v;
        if ($v !== null && $m['type'] === 'number') $v = (string) (float) $v;
        $o[$col] = $v !== null ? mb_substr($v, 0, 5000, 'UTF-8') : null;
    }
    return $o;
}
function api_need_edit(bool $canEdit): void
{
    if (!$canEdit) api_fail('لا تملك صلاحية التعديل.', 403);
}

/* ───────────────────────── قراءة ───────────────────────── */

if ($a === 'bootstrap') {
    $ACTIONS = mgmt_action_types(false);
    $ACTIVE  = mgmt_action_types(true);
    $ENDONLY = mgmt_end_only_slugs($ACTIONS);

    $sessions = $pdo->query('SELECT * FROM mgmt_sessions ORDER BY session_date DESC, id DESC')->fetchAll();
    $dirs = [];
    foreach ($pdo->query('SELECT * FROM mgmt_directives ORDER BY id ASC') as $d) {
        $dirs[(int) $d['session_id']][] = [
            'id' => (int) $d['id'], 'target_type' => $d['target_type'],
            'employee_id' => $d['employee_id'] !== null ? (int) $d['employee_id'] : null,
            'candidate_id' => $d['candidate_id'] !== null ? (int) $d['candidate_id'] : null,
            'target_name' => $d['target_name'], 'target_title' => $d['target_title'], 'project' => $d['project'] ?? null,
            'action_type' => $d['action_type'], 'start_date' => $d['start_date'], 'end_date' => $d['end_date'],
            'details' => $d['details'], 'hr_note' => $d['hr_note'] ?? null, 'status' => $d['status'] ?? 'new',
            'scale_grade' => $d['scale_grade'], 'scale_level' => $d['scale_level'] !== null ? (int) $d['scale_level'] : null,
            'scale_step' => $d['scale_step'] !== null ? (int) $d['scale_step'] : null,
            'scale_amount' => $d['scale_amount'] !== null ? (float) $d['scale_amount'] : null, 'scale_currency' => $d['scale_currency'],
            'extra' => api_extra($pdo, 'mgmt_directives', API_KNOWN_DIR, $d),
        ];
    }
    $outSessions = [];
    foreach ($sessions as $s) {
        $outSessions[] = [
            'id' => (int) $s['id'], 'ref' => mgmt_ref_of($s), 'title' => $s['title'], 'session_date' => $s['session_date'],
            'issued_by' => $s['issued_by'], 'notes' => $s['notes'], 'status' => $s['status'] ?? 'open', 'closed_at' => $s['closed_at'] ?? null,
            'directives' => $dirs[(int) $s['id']] ?? [],
            'extra' => api_extra($pdo, 'mgmt_sessions', API_KNOWN_SES, $s),
        ];
    }

    // رقم الهوية (إن وُجد عمود له في employees) يُرسل في «nid» لربط التوجيه بملف الموظف في منصة PEF بدقة
    $empCols = api_columns($pdo, 'employees');
    $nidCol = null;
    foreach (['national_id', 'id_number', 'nid', 'identity_number', 'identity_no', 'id_no', 'national_no', 'national_number', 'idno'] as $cn) {
        if (isset($empCols[$cn])) { $nidCol = $cn; break; }
    }
    $employees = [];
    foreach ($pdo->query("SELECT id, name_ar, job_title" . ($nidCol ? ", `" . $nidCol . "` AS nid" : "") . " FROM employees WHERE name_ar IS NOT NULL AND name_ar <> '' ORDER BY name_ar") as $e) {
        $employees[] = ['id' => (int) $e['id'], 'name' => $e['name_ar'], 'title' => $e['job_title'], 'nid' => $nidCol ? (string) ($e['nid'] ?? '') : null];
    }
    $cands = [];
    foreach ($pdo->query("SELECT rc.id, rc.candidate_name, rc.decision, r.job_title FROM recruitment_candidates rc
        JOIN recruitments r ON r.id = rc.recruitment_id WHERE rc.candidate_name IS NOT NULL AND rc.candidate_name <> ''
        ORDER BY r.job_title, rc.candidate_name") as $c) {
        $cands[] = ['id' => (int) $c['id'], 'name' => $c['candidate_name'], 'job' => $c['job_title'], 'decision' => $c['decision']];
    }
    $scale = [];
    $ver = $pdo->query('SELECT year, version FROM salary_scale_rows ORDER BY year DESC, version DESC LIMIT 1')->fetch();
    if ($ver) {
        $sr = $pdo->prepare('SELECT * FROM salary_scale_rows WHERE year = :y AND version = :v ORDER BY grade, level');
        $sr->execute(['y' => $ver['year'], 'v' => $ver['version']]);
        foreach ($sr->fetchAll() as $r) {
            $scale[] = ['id' => (int) $r['id'], 'grade' => $r['grade'], 'level' => (int) $r['level'], 'currency' => $r['currency'], 'desc' => $r['description'],
                'steps' => [(float) $r['step1'], (float) $r['step2'], (float) $r['step3'], (float) $r['step4'], (float) $r['step5'], (float) $r['step6'], (float) $r['step7'], (float) $r['step8']]];
        }
    }
    $projects = [];
    foreach ($pdo->query("SELECT project FROM payroll_rows WHERE project IS NOT NULL AND TRIM(project) <> ''
        GROUP BY project ORDER BY MAX(cycle_id) DESC, COUNT(*) DESC LIMIT 300") as $r) {
        $projects[] = (string) $r['project'];
    }
    $actions = [];
    foreach ($ACTIONS as $slug => $t) {
        $actions[] = ['slug' => $slug, 'label' => $t['label'] ?? $slug, 'tone' => $t['tone'] ?? 'slate', 'icon' => $t['icon'] ?? '',
            'active' => isset($ACTIVE[$slug]), 'endOnly' => in_array($slug, $ENDONLY, true)];
    }
    $statuses = [];
    foreach (mgmt_statuses() as $k => $s) { $statuses[] = ['k' => $k, 'label' => $s['label'] ?? $k]; }

    // مخطط ذاتيّ الوصف: يتغيّر رقمه كلما تغيّرت الحقول أو الأنواع أو الحالات، فيعرف التطبيق أن عليه إعادة البناء.
    $sch = ['directive' => [], 'session' => []];
    foreach (['directive' => ['mgmt_directives', API_KNOWN_DIR], 'session' => ['mgmt_sessions', API_KNOWN_SES]] as $k => [$tbl, $known]) {
        foreach (api_columns($pdo, $tbl) as $col => $m) {
            if (in_array($col, API_HIDDEN, true)) continue;
            $sch[$k][] = ['k' => $col, 'type' => $m['type'], 'label' => $m['label'] !== '' ? $m['label'] : null, 'extra' => !in_array($col, $known, true)];
        }
    }
    $theme = ['brand' => '#123a40', 'accent' => '#c29a4b', 'ok' => '#16653a', 'warn' => '#7a4a05', 'bad' => '#8a2019',
        'tones' => array_map(static fn ($t) => $t['tone'] ?? 'slate', $ACTIONS), 'statuses' => mgmt_statuses()];
    $schemaVer = substr(md5(json_encode([$sch, $actions, $statuses, $theme])), 0, 12);

    api_out(200, ['ok' => true, 'user' => ['name' => $user['username'] ?? '', 'canEdit' => $canEdit], 'at' => time(),
        'schema_version' => $schemaVer, 'schema' => $sch, 'theme' => $theme,
        'sessions' => $outSessions, 'employees' => $employees, 'candidates' => $cands, 'scale' => $scale, 'projects' => $projects,
        'actions' => $actions, 'statuses' => $statuses, 'targets' => mgmt_target_types()]);
}

if ($a === 'expiring') {
    $cycles = [];
    foreach ($pdo->query('SELECT id, cycle_year, cycle_month FROM payroll_cycles ORDER BY cycle_year DESC, cycle_month DESC') as $c) {
        $cycles[] = ['id' => (int) $c['id'], 'ym' => sprintf('%04d-%02d', (int) $c['cycle_year'], (int) $c['cycle_month'])];
    }
    $cid = (int) ($_GET['cid'] ?? 0);
    $ids = array_column($cycles, 'id');
    if (!in_array($cid, $ids, true)) $cid = $ids ? (int) $ids[0] : 0;
    $months = [];
    $list = [];
    $end = (string) ($_GET['end'] ?? '');
    if ($cid) {
        $em = $pdo->prepare("SELECT DATE_FORMAT(contract_end,'%Y-%m') em, COUNT(DISTINCT national_id) c
            FROM payroll_rows WHERE cycle_id = :c AND contract_end IS NOT NULL GROUP BY em ORDER BY em");
        $em->execute(['c' => $cid]);
        foreach ($em as $r) { $months[] = ['ym' => $r['em'], 'n' => (int) $r['c']]; }
        if (!preg_match('/^\d{4}-\d{2}$/', $end)) {
            $cur = '';
            foreach ($cycles as $c) { if ($c['id'] === $cid) $cur = $c['ym']; }
            $end = '';
            foreach ($months as $m) { if ($m['ym'] === $cur) $end = $cur; }
            if ($end === '') { foreach ($months as $m) { if ($m['ym'] >= $cur) { $end = $m['ym']; break; } } }
            if ($end === '' && $months) $end = $months[0]['ym'];
        }
        if ($end !== '') {
            $ms = $end . '-01';
            $me = date('Y-m-t', strtotime($ms));
            $q = $pdo->prepare("SELECT national_id, MAX(employee_name) name_ar, MAX(job_title) title_ar, MAX(contract_no) contract_no,
                    MIN(contract_start) start_date, MAX(contract_end) end_date
                FROM payroll_rows WHERE cycle_id = :c AND contract_end BETWEEN :ms AND :me GROUP BY national_id ORDER BY end_date, name_ar");
            $q->execute(['c' => $cid, 'ms' => $ms, 'me' => $me]);
            foreach (mgmt_mark_renewed($pdo, $q->fetchAll()) as $r) {
                $list[] = ['national_id' => $r['national_id'], 'name' => $r['name_ar'], 'title' => $r['title_ar'], 'contract_no' => $r['contract_no'],
                    'start' => $r['start_date'], 'end' => $r['end_date'], 'renewed' => !empty($r['renewed']), 'renew_end' => $r['renew_end'] ?? null];
            }
        }
    }
    api_out(200, ['ok' => true, 'cycles' => $cycles, 'cid' => $cid, 'months' => $months, 'end' => $end, 'list' => $list]);
}

if ($method !== 'POST') api_fail('إجراء غير معروف.', 400);

/* ───────────────────────── كتابة ───────────────────────── */
api_need_edit($canEdit);

if ($a === 'session_save') {
    $id = (int) ($body['id'] ?? 0);
    $title = trim((string) ($body['title'] ?? ''));
    $date = trim((string) ($body['session_date'] ?? ''));
    $by = trim((string) ($body['issued_by'] ?? ''));
    $notes = trim((string) ($body['notes'] ?? ''));
    if ($title === '') api_fail('يرجى إدخال عنوان الجلسة.');
    $sx = api_extra_in($pdo, 'mgmt_sessions', API_KNOWN_SES, $body['extra'] ?? null);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) $date = date('Y-m-d');
    if ($id > 0) {
        $pdo->prepare('UPDATE mgmt_sessions SET title = :t, session_date = :d, issued_by = :b, notes = :n WHERE id = :i')
            ->execute(['t' => $title, 'd' => $date, 'b' => $by ?: null, 'n' => $notes ?: null, 'i' => $id]);
        foreach ($sx as $col => $val) { $pdo->prepare('UPDATE mgmt_sessions SET `' . $col . '` = :v WHERE id = :i')->execute(['v' => $val, 'i' => $id]); }
        logAction('update', 'mgmt_ops', 'mgmt_session', $id, $title);
        api_out(200, ['ok' => true, 'id' => $id]);
    }
    $pdo->prepare('INSERT INTO mgmt_sessions (title, session_date, issued_by, notes, created_by) VALUES (:t, :d, :b, :n, :c)')
        ->execute(['t' => $title, 'd' => $date, 'b' => $by ?: null, 'n' => $notes ?: null, 'c' => $user['username'] ?? null]);
    $sid = (int) $pdo->lastInsertId();
    foreach ($sx as $col => $val) { $pdo->prepare('UPDATE mgmt_sessions SET `' . $col . '` = :v WHERE id = :i')->execute(['v' => $val, 'i' => $sid]); }
    logAction('create', 'mgmt_ops', 'mgmt_session', $sid, $title);
    api_out(200, ['ok' => true, 'id' => $sid]);
}

if ($a === 'session_close' || $a === 'session_reopen' || $a === 'session_delete') {
    $id = (int) ($body['id'] ?? 0);
    $st = $pdo->prepare('SELECT title FROM mgmt_sessions WHERE id = :i');
    $st->execute(['i' => $id]);
    $title = $st->fetchColumn();
    if ($title === false) api_fail('الجلسة غير موجودة.', 404);
    if ($a === 'session_close') {
        $pdo->prepare('UPDATE mgmt_sessions SET status = "closed", closed_at = NOW(), closed_by = :u WHERE id = :i')
            ->execute(['u' => $user['username'] ?? null, 'i' => $id]);
        logAction('update', 'mgmt_ops', 'mgmt_session', $id, 'close');
    } elseif ($a === 'session_reopen') {
        $pdo->prepare('UPDATE mgmt_sessions SET status = "open", closed_at = NULL, closed_by = NULL WHERE id = :i')->execute(['i' => $id]);
        logAction('update', 'mgmt_ops', 'mgmt_session', $id, 'reopen');
    } else {
        $pdo->prepare('DELETE FROM mgmt_sessions WHERE id = :i')->execute(['i' => $id]);
        logAction('delete', 'mgmt_ops', 'mgmt_session', $id, (string) $title);
    }
    api_out(200, ['ok' => true, 'id' => $id]);
}

if ($a === 'directive_status') {
    $id = (int) ($body['id'] ?? 0);
    $status = (string) ($body['status'] ?? '');
    if (!isset(mgmt_statuses()[$status])) api_fail('حالة غير صالحة.');
    $sid = api_session_of($pdo, $id);
    if ($sid === null) api_fail('التوجيه غير موجود.', 404);
    api_guard_open($pdo, $sid);
    if (array_key_exists('hr_note', $body)) {
        $note = trim((string) $body['hr_note']);
        $pdo->prepare('UPDATE mgmt_directives SET status = :s, hr_note = :n WHERE id = :i')->execute(['s' => $status, 'n' => $note ?: null, 'i' => $id]);
    } else {
        $pdo->prepare('UPDATE mgmt_directives SET status = :s WHERE id = :i')->execute(['s' => $status, 'i' => $id]);
    }
    logAction('update', 'mgmt_ops', 'mgmt_directive', $id, 'status=' . $status);
    api_out(200, ['ok' => true, 'id' => $id, 'status' => $status]);
}

if ($a === 'directive_delete') {
    $id = (int) ($body['id'] ?? 0);
    $sid = api_session_of($pdo, $id);
    if ($sid === null) api_fail('التوجيه غير موجود.', 404);
    api_guard_open($pdo, $sid);
    $pdo->prepare('DELETE FROM mgmt_directives WHERE id = :i')->execute(['i' => $id]);
    logAction('delete', 'mgmt_ops', 'mgmt_directive', $id, '');
    api_out(200, ['ok' => true, 'id' => $id]);
}

if ($a === 'directive_save') {
    $id = (int) ($body['id'] ?? 0);
    $sessionId = (int) ($body['session_id'] ?? 0);
    $targetType = (string) ($body['target_type'] ?? 'employee');
    $actionType = (string) ($body['action_type'] ?? '');
    $employeeId = (int) ($body['employee_id'] ?? 0);
    $candidateId = (int) ($body['candidate_id'] ?? 0);
    $targetName = trim((string) ($body['target_name'] ?? ''));
    $targetTitle = trim((string) ($body['target_title'] ?? ''));
    $startDate = trim((string) ($body['start_date'] ?? ''));
    $endDate = trim((string) ($body['end_date'] ?? ''));
    $details = trim((string) ($body['details'] ?? ''));
    $project = mb_substr(trim((string) ($body['project'] ?? '')), 0, 200, 'UTF-8');
    $scaleRowId = (int) ($body['scale_row_id'] ?? 0);
    $scaleStep = (int) ($body['scale_step'] ?? 0);

    $scaleGrade = $scaleLevel = $scaleAmount = $scaleCurrency = null;
    $scaleStepOut = null;
    if ($scaleRowId > 0 && $scaleStep >= 1 && $scaleStep <= 8) {
        $srow = $pdo->prepare('SELECT grade, level, currency, step1, step2, step3, step4, step5, step6, step7, step8 FROM salary_scale_rows WHERE id = :i');
        $srow->execute(['i' => $scaleRowId]);
        if ($r = $srow->fetch()) {
            $scaleGrade = (string) $r['grade'];
            $scaleLevel = (int) $r['level'];
            $scaleStepOut = $scaleStep;
            $scaleAmount = (float) $r['step' . $scaleStep];
            $scaleCurrency = (string) $r['currency'];
        }
    }
    if (!isset(mgmt_target_types()[$targetType])) $targetType = 'employee';
    if (!isset(mgmt_action_types()[$actionType])) api_fail('يرجى اختيار نوع التوجيه.');

    if ($targetType === 'employee' && $employeeId > 0) {
        $emp = $pdo->prepare('SELECT name_ar, job_title FROM employees WHERE id = :i');
        $emp->execute(['i' => $employeeId]);
        if ($row = $emp->fetch()) { $targetName = (string) $row['name_ar']; $targetTitle = (string) ($row['job_title'] ?? ''); }
        $candidateId = 0;
    } elseif ($targetType === 'candidate' && $candidateId > 0) {
        $cnd = $pdo->prepare('SELECT rc.candidate_name, r.job_title FROM recruitment_candidates rc JOIN recruitments r ON r.id = rc.recruitment_id WHERE rc.id = :i');
        $cnd->execute(['i' => $candidateId]);
        if ($row = $cnd->fetch()) { $targetName = (string) $row['candidate_name']; $targetTitle = (string) ($row['job_title'] ?? ''); } else { $candidateId = 0; }
        $employeeId = 0;
    } else {
        $employeeId = 0;
        $candidateId = 0;
    }
    if ($targetName === '') api_fail('يرجى تحديد اسم الموظف أو المرشّح المعنيّ بالتوجيه.');
    $startDate = preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate) ? $startDate : null;
    $endDate   = preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate) ? $endDate : null;
    if (in_array($actionType, mgmt_end_only_slugs(mgmt_action_types(false)), true)) {
        if ($endDate === null) api_fail('يرجى تحديد تاريخ انتهاء التكليف.');
        $startDate = null;
    }

    $xin = api_extra_in($pdo, 'mgmt_directives', API_KNOWN_DIR, $body['extra'] ?? null);
    if ($id > 0) {
        $sid = api_session_of($pdo, $id);
        if ($sid === null) api_fail('التوجيه غير موجود.', 404);
        api_guard_open($pdo, $sid);
        $pdo->prepare('UPDATE mgmt_directives SET target_type = :tt, employee_id = :eid, candidate_id = :cid, target_name = :tn, target_title = :ttl,
                       project = :pj, action_type = :at, start_date = :sd, end_date = :ed, details = :d, scale_grade = :sg, scale_level = :sl,
                       scale_step = :ss, scale_amount = :sa, scale_currency = :sc WHERE id = :i')
            ->execute(['tt' => $targetType, 'eid' => $employeeId ?: null, 'cid' => $candidateId ?: null, 'tn' => $targetName, 'ttl' => $targetTitle ?: null,
                'pj' => $project ?: null, 'at' => $actionType, 'sd' => $startDate, 'ed' => $endDate, 'd' => $details ?: null,
                'sg' => $scaleGrade, 'sl' => $scaleLevel, 'ss' => $scaleStepOut, 'sa' => $scaleAmount, 'sc' => $scaleCurrency, 'i' => $id]);
        foreach ($xin as $col => $val) { $pdo->prepare('UPDATE mgmt_directives SET `' . $col . '` = :v WHERE id = :i')->execute(['v' => $val, 'i' => $id]); }
        logAction('update', 'mgmt_ops', 'mgmt_directive', $id, $targetName);
        api_out(200, ['ok' => true, 'id' => $id, 'session_id' => $sid]);
    }
    $chk = $pdo->prepare('SELECT COUNT(*) FROM mgmt_sessions WHERE id = :i');
    $chk->execute(['i' => $sessionId]);
    if (!$chk->fetchColumn()) api_fail('الجلسة غير موجودة.', 404);
    api_guard_open($pdo, $sessionId);
    $pdo->prepare('INSERT INTO mgmt_directives (session_id, target_type, employee_id, candidate_id, target_name, target_title, project, action_type,
                   start_date, end_date, details, scale_grade, scale_level, scale_step, scale_amount, scale_currency, status, created_by)
                   VALUES (:sid, :tt, :eid, :cid, :tn, :ttl, :pj, :at, :sd, :ed, :d, :sg, :sl, :ss, :sa, :sc, :st, :cb)')
        ->execute(['sid' => $sessionId, 'tt' => $targetType, 'eid' => $employeeId ?: null, 'cid' => $candidateId ?: null, 'tn' => $targetName,
            'ttl' => $targetTitle ?: null, 'pj' => $project ?: null, 'at' => $actionType, 'sd' => $startDate, 'ed' => $endDate, 'd' => $details ?: null,
            'sg' => $scaleGrade, 'sl' => $scaleLevel, 'ss' => $scaleStepOut, 'sa' => $scaleAmount, 'sc' => $scaleCurrency, 'st' => 'new',
            'cb' => $user['username'] ?? null]);
    $did = (int) $pdo->lastInsertId();
    foreach ($xin as $col => $val) { $pdo->prepare('UPDATE mgmt_directives SET `' . $col . '` = :v WHERE id = :i')->execute(['v' => $val, 'i' => $did]); }
    logAction('create', 'mgmt_ops', 'mgmt_directive', $did, $targetName);
    api_out(200, ['ok' => true, 'id' => $did, 'session_id' => $sessionId]);
}

api_fail('إجراء غير معروف.', 400);
