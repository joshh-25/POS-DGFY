<?php
declare(strict_types=1);

const DEPLOY_TOKEN = '__DEPLOY_TOKEN__';
const BACKEND_DIR = '__BACKEND_DIR__';
const IMS_DIR = '__IMS_DIR__';
const POS_DIR = '__POS_DIR__';
const STOREFRONT_DIR = '__STOREFRONT_DIR__';

function fail(string $message, int $status = 500): void {
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    echo "PREFLIGHT_FAILED={$message}\n";
    exit;
}

function requireToken(): void {
    $provided = $_GET['token'] ?? $_POST['token'] ?? '';
    if (!is_string($provided) || !hash_equals(DEPLOY_TOKEN, $provided)) {
        fail('invalid_token', 403);
    }
}

function resolveTargetDir(string $configured): string {
    $configured = trim(str_replace('\\', '/', $configured), '/');
    if ($configured === '' || strpos($configured, '..') !== false) {
        fail("invalid_target_dir:{$configured}");
    }

    $controlDir = realpath(__DIR__) ?: __DIR__;
    $controlName = basename($controlDir);
    if ($configured === '.' || $configured === $controlName) {
        return $controlDir;
    }

    return dirname($controlDir) . DIRECTORY_SEPARATOR . $configured;
}

function checkTarget(string $label, string $configured): void {
    $target = resolveTargetDir($configured);
    $exists = is_dir($target);
    $parent = dirname($target);
    $writable = ($exists && is_writable($target)) || (!$exists && is_dir($parent) && is_writable($parent));
    echo strtoupper($label) . "_DIR={$target}\n";
    echo strtoupper($label) . "_DIR_EXISTS=" . ($exists ? '1' : '0') . "\n";
    echo strtoupper($label) . "_DIR_WRITABLE=" . ($writable ? '1' : '0') . "\n";
    if (!$writable) {
        fail("target_not_writable:{$label}:{$target}");
    }
}

requireToken();
header('Content-Type: text/plain; charset=utf-8');

if (!class_exists('ZipArchive')) {
    fail('ziparchive_missing');
}

echo "PREFLIGHT_OK=1\n";
echo "PHP_VERSION=" . PHP_VERSION . "\n";
echo "ZIPARCHIVE=1\n";
echo "CONTROL_DIR=" . (realpath(__DIR__) ?: __DIR__) . "\n";
checkTarget('backend', BACKEND_DIR);
checkTarget('ims', IMS_DIR);
checkTarget('pos', POS_DIR);
checkTarget('storefront', STOREFRONT_DIR);
