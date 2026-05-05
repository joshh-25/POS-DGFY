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
        respond('BACKEND_ROLLBACK_FAILED=invalid_token', 403);
    }
}

function resolveTargetDir(string $configured): string {
    $configured = trim(str_replace('\\', '/', $configured), '/');
    if ($configured === '' || strpos($configured, '..') !== false) {
        respond("BACKEND_ROLLBACK_FAILED=invalid_target_dir:{$configured}", 500);
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
$targetDir = resolveTargetDir(BACKEND_DIR);
$backupDir = $targetDir . '.bak';
if (!is_dir($backupDir)) {
    respond('BACKEND_ROLLBACK_FAILED=missing_backup', 500);
}

$managed = ['app.js', 'package.json', 'package-lock.json', 'src', 'config', 'migrations', 'node_modules'];
foreach ($managed as $entry) {
    rrmdir($targetDir . DIRECTORY_SEPARATOR . $entry);
    $backup = $backupDir . DIRECTORY_SEPARATOR . $entry;
    if (file_exists($backup) || is_link($backup)) {
        copyRecursive($backup, $targetDir . DIRECTORY_SEPARATOR . $entry);
    }
}

respond('BACKEND_ROLLBACK_OK=1');
