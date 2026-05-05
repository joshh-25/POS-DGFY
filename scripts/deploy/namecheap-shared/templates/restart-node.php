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
        respond('NODE_RESTART_FAILED=invalid_token', 403);
    }
}

function resolveTargetDir(string $configured): string {
    $configured = trim(str_replace('\\', '/', $configured), '/');
    if ($configured === '' || strpos($configured, '..') !== false) {
        respond("NODE_RESTART_FAILED=invalid_target_dir:{$configured}", 500);
    }
    $controlDir = realpath(__DIR__) ?: __DIR__;
    if ($configured === '.' || $configured === basename($controlDir)) {
        return $controlDir;
    }
    return dirname($controlDir) . DIRECTORY_SEPARATOR . $configured;
}

requireToken();
$backendDir = resolveTargetDir(BACKEND_DIR);
$tmpDir = $backendDir . DIRECTORY_SEPARATOR . 'tmp';
if (!is_dir($tmpDir) && !mkdir($tmpDir, 0755, true)) {
    respond("NODE_RESTART_FAILED=cannot_create_tmp:{$tmpDir}", 500);
}
$restartFile = $tmpDir . DIRECTORY_SEPARATOR . 'restart.txt';
if (file_put_contents($restartFile, gmdate('c') . PHP_EOL) === false) {
    respond("NODE_RESTART_FAILED=cannot_write_restart:{$restartFile}", 500);
}
respond('NODE_RESTART_OK=1');
