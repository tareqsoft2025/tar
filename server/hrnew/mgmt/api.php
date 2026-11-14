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
if (!userCan('mgmt_ops', 'view')) {
    api_fail('لا تملك صلاحية عمليات الإدارة.', 403);
}
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
        ];
    }
    $outSessions = [];
    foreach ($sessions as $s) {
        $outSessions[] = [
            'id' => (int) $s['id'], 'ref' => mgmt_ref_of($s), 'title' => $s['title'], 'session_date' => $s['session_date'],
            'issued_by' => $s['issued_by'], 'notes' => $s['notes'], 'status' => $s['status'] ?? 'open', 'closed_at' => $s['closed_at'] ?? null,
            'directives' => $dirs[(int) $s['id']] ?? [],
        ];
    }

    $employees = [];
    foreach ($pdo->query("SELECT id, name_ar, job_title FROM employees WHERE name_ar IS NOT NULL AND name_ar <> '' ORDER BY name_ar") as $e) {
        $employees[] = ['id' => (int) $e['id'], 'name' => $e['name_ar'], 'title' => $e['job_title']];
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

    api_out(200, ['ok' => true, 'user' => ['name' => $user['username'] ?? '', 'canEdit' => $canEdit], 'at' => time(),
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
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) $date = date('Y-m-d');
    if ($id > 0) {
        $pdo->prepare('UPDATE mgmt_sessions SET title = :t, session_date = :d, issued_by = :b, notes = :n WHERE id = :i')
            ->execute(['t' => $title, 'd' => $date, 'b' => $by ?: null, 'n' => $notes ?: null, 'i' => $id]);
        logAction('update', 'mgmt_ops', 'mgmt_session', $id, $title);
        api_out(200, ['ok' => true, 'id' => $id]);
    }
    $pdo->prepare('INSERT INTO mgmt_sessions (title, session_date, issued_by, notes, created_by) VALUES (:t, :d, :b, :n, :c)')
        ->execute(['t' => $title, 'd' => $date, 'b' => $by ?: null, 'n' => $notes ?: null, 'c' => $user['username'] ?? null]);
    $sid = (int) $pdo->lastInsertId();
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
    logAction('create', 'mgmt_ops', 'mgmt_directive', $did, $targetName);
    api_out(200, ['ok' => true, 'id' => $did, 'session_id' => $sessionId]);
}

api_fail('إجراء غير معروف.', 400);
