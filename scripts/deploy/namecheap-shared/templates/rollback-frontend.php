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
        respond('FRONTEND_ROLLBACK_FAILED=invalid_token', 403);
    }
}

function resolveTargetDir(string $configured): string {
    $configured = trim(str_replace('\\', '/', $configured), '/');
    if ($configured === '' || strpos($configured, '..') !== false) {
        respond("FRONTEND_ROLLBACK_FAILED=invalid_target_dir:{$configured}", 500);
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

function surfaceDir(string $surface): string {
    return match ($surface) {
        'ims' => IMS_DIR,
        'pos' => POS_DIR,
        'storefront' => STOREFRONT_DIR,
        default => respond("FRONTEND_ROLLBACK_FAILED=invalid_surface:{$surface}", 400),
    };
}

requireToken();
$surface = strtolower((string)($_GET['surface'] ?? $_POST['surface'] ?? ''));
$targetDir = resolveTargetDir(surfaceDir($surface));
$backupDir = $targetDir . '.bak';
if (!is_dir($backupDir)) {
    respond("FRONTEND_ROLLBACK_FAILED=missing_backup:{$surface}", 500);
}

$managed = ['index.html', 'assets', 'sw.js', 'manifest.json', 'favicon.ico', 'robots.txt', 'version.json'];
foreach ($managed as $entry) {
    rrmdir($targetDir . DIRECTORY_SEPARATOR . $entry);
    $backup = $backupDir . DIRECTORY_SEPARATOR . $entry;
    if (file_exists($backup) || is_link($backup)) {
        copyRecursive($backup, $targetDir . DIRECTORY_SEPARATOR . $entry);
    }
}

respond("FRONTEND_ROLLBACK_OK={$surface}");
