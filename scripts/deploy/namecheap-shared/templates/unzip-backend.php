<?php
declare(strict_types=1);

const DEPLOY_TOKEN = '__DEPLOY_TOKEN__';
const BACKEND_DIR = '__BACKEND_DIR__';

function respond(string $line, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    echo $line . "\n";
    exit;
}

function requireToken(): void {
    $provided = $_GET['token'] ?? $_POST['token'] ?? '';
    if (!is_string($provided) || !hash_equals(DEPLOY_TOKEN, $provided)) {
        respond('BACKEND_UNZIP_FAILED=invalid_token', 403);
    }
}

function resolveTargetDir(string $configured): string {
    $configured = trim(str_replace('\\', '/', $configured), '/');
    if ($configured === '' || strpos($configured, '..') !== false) {
        respond("BACKEND_UNZIP_FAILED=invalid_target_dir:{$configured}", 500);
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

requireToken();
if (!class_exists('ZipArchive')) {
    respond('BACKEND_UNZIP_FAILED=ziparchive_missing', 500);
}

$zipPath = __DIR__ . DIRECTORY_SEPARATOR . 'backend-shared.zip';
if (!is_file($zipPath)) {
    respond('BACKEND_UNZIP_FAILED=missing_backend_zip', 500);
}

$targetDir = resolveTargetDir(BACKEND_DIR);
if (!is_dir($targetDir) && !mkdir($targetDir, 0755, true)) {
    respond("BACKEND_UNZIP_FAILED=cannot_create_target:{$targetDir}", 500);
}
if (!is_writable($targetDir)) {
    respond("BACKEND_UNZIP_FAILED=target_not_writable:{$targetDir}", 500);
}

$backupDir = $targetDir . '.bak';
rrmdir($backupDir);
mkdir($backupDir, 0755, true);

$managed = ['app.js', 'package.json', 'package-lock.json', 'src', 'config', 'migrations', 'node_modules'];
foreach ($managed as $entry) {
    $source = $targetDir . DIRECTORY_SEPARATOR . $entry;
    if (file_exists($source) || is_link($source)) {
        copyRecursive($source, $backupDir . DIRECTORY_SEPARATOR . $entry);
        rrmdir($source);
    }
}

$zip = new ZipArchive();
if ($zip->open($zipPath) !== true) {
    respond('BACKEND_UNZIP_FAILED=open_zip_failed', 500);
}
if (!$zip->extractTo($targetDir)) {
    $zip->close();
    respond('BACKEND_UNZIP_FAILED=extract_failed', 500);
}
$zip->close();

if (!is_dir($targetDir . DIRECTORY_SEPARATOR . 'tmp')) {
    mkdir($targetDir . DIRECTORY_SEPARATOR . 'tmp', 0755, true);
}

@unlink($zipPath);
respond('BACKEND_UNZIP_OK=1');
