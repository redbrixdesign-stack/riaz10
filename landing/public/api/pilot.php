<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    echo json_encode(['ok' => true, 'service' => 'beelo-pilot']);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false]);
    exit;
}

// Accept only small JSON requests originating from the Beelo website.
$contentType = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
if (!str_starts_with($contentType, 'application/json')) {
    http_response_code(415);
    echo json_encode(['ok' => false]);
    exit;
}
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 12000) {
    http_response_code(413);
    echo json_encode(['ok' => false]);
    exit;
}
$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if ($origin !== '') {
    $originHost = strtolower((string)(parse_url($origin, PHP_URL_HOST) ?: ''));
    if (!in_array($originHost, ['beelestial.co.uk', 'www.beelestial.co.uk'], true)) {
        http_response_code(403);
        echo json_encode(['ok' => false]);
        exit;
    }
}

$data = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['ok' => false]);
    exit;
}

// Honeypot field: real visitors never see or complete it.
if (!empty($data['website'])) {
    echo json_encode(['ok' => true]);
    exit;
}

// Humans need time to read and complete the form. Very fast submissions are
// normally scripted; very old pages should be refreshed before submission.
$formElapsedMs = (int)($data['formElapsedMs'] ?? 0);
if ($formElapsedMs < 2500 || $formElapsedMs > 86400000) {
    http_response_code(422);
    echo json_encode(['ok' => false]);
    exit;
}

function clean_string(array $data, string $key, int $max): string {
    $value = trim((string)($data[$key] ?? ''));
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '';
    return mb_substr($value, 0, $max);
}

$name = clean_string($data, 'name', 120);
$email = filter_var(clean_string($data, 'email', 180), FILTER_VALIDATE_EMAIL);
$phone = clean_string($data, 'phone', 60);
$trade = clean_string($data, 'trade', 120);
$area = clean_string($data, 'area', 100);
$ukResident = !empty($data['ukResident']);
$worksAlone = clean_string($data, 'worksAlone', 20);
$problem = clean_string($data, 'biggestProblem', 1500);
$partnerInterest = !empty($data['partnerInterest']) ? 'Yes' : 'No';

$compactPostcode = strtoupper((string)preg_replace('/\s+/', '', $area));
$validUkPostcode = preg_match('/^(GIR0AA|[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2})$/', $compactPostcode) === 1;
if (!$ukResident || !$validUkPostcode) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'code' => 'uk_only']);
    exit;
}
$area = substr($compactPostcode, 0, -3) . ' ' . substr($compactPostcode, -3);

if ($name === '' || !$email || $trade === '' || $area === '' || $problem === '' || !in_array($worksAlone, ['yes', 'no', 'sometimes'], true)) {
    http_response_code(422);
    echo json_encode(['ok' => false]);
    exit;
}

// Throttle both the source and recipient so the endpoint cannot be used to
// flood the inbox or send repeated acknowledgements to someone else.
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
$rateFile = __DIR__ . '/rate-limit.json';
$now = time();
$ipKey = hash('sha256', 'beelo-ip|' . $ip);
$emailKey = hash('sha256', 'beelo-email|' . strtolower((string)$email));
$limited = false;
$rateSaved = false;
$rateHandle = @fopen($rateFile, 'c+');
if ($rateHandle && flock($rateHandle, LOCK_EX)) {
    rewind($rateHandle);
    $decoded = json_decode((string)stream_get_contents($rateHandle), true);
    $rates = is_array($decoded) && isset($decoded['ip'], $decoded['email'])
        ? $decoded
        : ['ip' => [], 'email' => []];

    foreach (['ip' => 3600, 'email' => 86400] as $group => $window) {
        foreach ($rates[$group] as $key => $timestamps) {
            $recent = array_values(array_filter(
                is_array($timestamps) ? $timestamps : [],
                fn($ts) => is_int($ts) && $ts > $now - $window
            ));
            if ($recent) $rates[$group][$key] = $recent;
            else unset($rates[$group][$key]);
        }
    }

    $ipRecent = $rates['ip'][$ipKey] ?? [];
    $emailRecent = $rates['email'][$emailKey] ?? [];
    $limited = count($ipRecent) >= 5 || count($emailRecent) >= 3;
    if (!$limited) {
        $rates['ip'][$ipKey] = [...$ipRecent, $now];
        $rates['email'][$emailKey] = [...$emailRecent, $now];
        rewind($rateHandle);
        ftruncate($rateHandle, 0);
        $rateSaved = fwrite($rateHandle, (string)json_encode($rates)) !== false;
        fflush($rateHandle);
    }
    flock($rateHandle, LOCK_UN);
    fclose($rateHandle);
}
if ($limited) {
    http_response_code(429);
    echo json_encode(['ok' => false]);
    exit;
}
if (!$rateSaved) {
    if (is_resource($rateHandle)) fclose($rateHandle);
    http_response_code(503);
    echo json_encode(['ok' => false]);
    exit;
}

$submittedAt = gmdate('c');
$row = [$submittedAt, $name, (string)$email, $phone, $trade, $area, $worksAlone, $problem, $partnerInterest];
$backupSaved = false;
$csvPath = __DIR__ . '/applications.csv';
$file = @fopen($csvPath, 'ab');
if ($file) {
    if (flock($file, LOCK_EX)) {
        if (filesize($csvPath) === 0) {
            fputcsv($file, ['submitted_at', 'name', 'email', 'phone', 'trade', 'area', 'works_alone', 'biggest_problem', 'partner_interest']);
        }
        $backupSaved = fputcsv($file, $row) !== false;
        flock($file, LOCK_UN);
    }
    fclose($file);
}

$safeName = str_replace(["\r", "\n"], '', $name);
$safeEmail = str_replace(["\r", "\n"], '', (string)$email);
$subject = 'New Beelo pilot application — ' . $safeName;
$message = "A new application has been submitted through beelestial.co.uk.\n\n"
    . "Name: {$name}\nEmail: {$email}\nPhone: {$phone}\nTrade / role: {$trade}\nArea / postcode: {$area}\n"
    . "UK resident and worker: Yes\nUsually works alone: {$worksAlone}\nPartnership/research interest: {$partnerInterest}\n\n"
    . "Biggest admin problem:\n{$problem}\n\nSubmitted: {$submittedAt}\n";
$headers = [
    'From: Beelo Website <hello@beelestial.co.uk>',
    'Reply-To: ' . $safeEmail,
    'Content-Type: text/plain; charset=UTF-8'
];
$mailed = @mail('hello@beelestial.co.uk', $subject, $message, implode("\r\n", $headers));

// Send the applicant a short acknowledgement without implying pilot acceptance.
// Auto-response headers help prevent mail loops with other automated systems.
$confirmationSubject = 'We have received your Beelo pilot application';
$confirmationMessage = "Hello {$name},\n\n"
    . "Thank you for applying to join the UK Beelo pilot. We have received your details.\n\n"
    . "What happens next:\n"
    . "- We will review whether the pilot is a good fit for your work.\n"
    . "- If it looks suitable, Riaz will contact you personally to discuss the next step.\n"
    . "- There is no commitment at this stage.\n\n"
    . "We will only use your details to contact you about the Beelo pilot. "
    . "If you did not submit this application, please reply to this email and we will remove your details.\n\n"
    . "Kind regards,\n"
    . "Muhammad Asif Riaz\n"
    . "Founder, Beelo\n"
    . "https://beelestial.co.uk\n";
$confirmationHeaders = [
    'From: Beelo <hello@beelestial.co.uk>',
    'Reply-To: hello@beelestial.co.uk',
    'Content-Type: text/plain; charset=UTF-8',
    'Auto-Submitted: auto-generated',
    'X-Auto-Response-Suppress: All'
];
@mail((string)$email, $confirmationSubject, $confirmationMessage, implode("\r\n", $confirmationHeaders));

if (!$mailed && !$backupSaved) {
    http_response_code(503);
    echo json_encode(['ok' => false]);
    exit;
}

echo json_encode(['ok' => true]);
