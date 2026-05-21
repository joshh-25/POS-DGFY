<?php
declare(strict_types=1);

const DEPLOY_TOKEN = '__DEPLOY_TOKEN__';
const IMS_DIR = '__IMS_DIR__';
const POS_DIR = '__POS_DIR__';
const STOREFRONT_DIR = '__STOREFRONT_DIR__';

function respond(string $line, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    echo $line . "\n";
    exit;
}

function requireToken(): void {
    $provided = $_GET['token'] ?? $_POST['token'] ?? '';
    if (!is_string($provided) || !hash_equals(DEPLOY_TOKEN, $provided)) {
        respond('FRONTEND_UNZIP_FAILED=invalid_token', 403);
    }
}

function resolveTargetDir(string $configured): string {
    $configured = trim(str_replace('\\', '/', $configured), '/');
    if ($configured === '' || strpos($configured, '..') !== false) {
        respond("FRONTEND_UNZIP_FAILED=invalid_target_dir:{$configured}", 500);
    }
    $controlDir = realpath(__DIR__) ?: __DIR__;
    if ($configured === '.' || $configured === basename($controlDir)) {
        return $controlDir;
    }
    return dirname($controlDir) . DIRECTORY_SEPARATOR . $configured;
}

function rrmdir(string $path): void {
    if (!file_exists($path) && !is_link($path)) return;
    if (is_file($path) || is_link($path)) {
        @unlink($path);
        return;
    }
    $items = scandir($path);
    if ($items === false) return;
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        rrmdir($path . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($path);
}

function copyRecursive(string $source, string $destination): void {
    if (is_file($source) || is_link($source)) {
        @copy($source, $destination);
        return;
    }
    if (!is_dir($source)) return;
    if (!is_dir($destination)) {
        mkdir($destination, 0755, true);
    }
    $items = scandir($source);
    if ($items === false) return;
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        copyRecursive($source . DIRECTORY_SEPARATOR . $item, $destination . DIRECTORY_SEPARATOR . $item);
    }
}

function surfaceConfig(string $surface): array {
    return match ($surface) {
        'ims' => ['dir' => IMS_DIR, 'zip' => 'skupervisor.zip'],
        'pos' => ['dir' => POS_DIR, 'zip' => 'pos.zip'],
        'storefront' => ['dir' => STOREFRONT_DIR, 'zip' => 'storefront.zip'],
        default => respond("FRONTEND_UNZIP_FAILED=invalid_surface:{$surface}", 400),
    };
}

requireToken();
if (!class_exists('ZipArchive')) {
    respond('FRONTEND_UNZIP_FAILED=ziparchive_missing', 500);
}

$surface = strtolower((string)($_GET['surface'] ?? $_POST['surface'] ?? ''));
$cfg = surfaceConfig($surface);
$zipPath = __DIR__ . DIRECTORY_SEPARATOR . $cfg['zip'];
if (!is_file($zipPath)) {
    respond("FRONTEND_UNZIP_FAILED=missing_zip:{$surface}", 500);
}

$targetDir = resolveTargetDir($cfg['dir']);
if (!is_dir($targetDir) && !mkdir($targetDir, 0755, true)) {
    respond("FRONTEND_UNZIP_FAILED=cannot_create_target:{$targetDir}", 500);
}
if (!is_writable($targetDir)) {
    respond("FRONTEND_UNZIP_FAILED=target_not_writable:{$targetDir}", 500);
}

$backupDir = $targetDir . '.bak';
rrmdir($backupDir);
mkdir($backupDir, 0755, true);

$managed = ['index.html', 'assets', 'sw.js', 'manifest.json', 'favicon.ico', 'robots.txt', 'version.json'];
foreach ($managed as $entry) {
    $source = $targetDir . DIRECTORY_SEPARATOR . $entry;
    if (file_exists($source) || is_link($source)) {
        copyRecursive($source, $backupDir . DIRECTORY_SEPARATOR . $entry);
        rrmdir($source);
    }
}

$zip = new ZipArchive();
if ($zip->open($zipPath) !== true) {
    respond("FRONTEND_UNZIP_FAILED=open_zip_failed:{$surface}", 500);
}
if (!$zip->extractTo($targetDir)) {
    $zip->close();
    respond("FRONTEND_UNZIP_FAILED=extract_failed:{$surface}", 500);
}
$zip->close();

@unlink($zipPath);
respond("FRONTEND_UNZIP_OK={$surface}");
