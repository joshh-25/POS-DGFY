import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const script = join(process.cwd(), "scripts", "dglaundry-connection-setup.mjs");
function run(action, root, extra = []) {
  try { return { status: 0, output: execFileSync(process.execPath, [script, action, "--environment", "staging", "--config-dir", root, ...extra], { encoding: "utf8" }) }; }
  catch (error) { return { status: error.status ?? 1, output: String(error.stdout ?? "") + String(error.stderr ?? "") }; }
}

test("setup package is safe, repeatable, and rollback-capable", () => {
  const root = mkdtempSync(join(tmpdir(), "dglaundry-setup-"));
  try {
    const prepared = run("prepare", root);
    assert.equal(prepared.status, 0);
    const preparedReport = JSON.parse(prepared.output);
    assert.equal(preparedReport.privateValues, "not-reported");
    assert.match(readFileSync(join(root, "dglaundry-connection.env.candidate"), "utf8"), /DGFY_OIDC_ISSUER=https:\/\/api\.stage\.dgfy\.ph\/oidc/);
    assert.equal(run("apply", root).status, 2);
    assert.equal(run("apply", root, ["--confirm"]).status, 0);
    assert.equal(run("verify", root).status, 2);
    const roles = {
      "dglaundry-machine-assertion.pub.pem": "rsa",
      "dglaundry-request-signing.pub.pem": "ec",
      "dglaundry-event-signing.pub.pem": "ed25519",
    };
    mkdirSync(join(root, "keys"), { recursive: true });
    for (const [name, type] of Object.entries(roles)) {
      const pair = type === "rsa"
        ? generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" } })
        : type === "ec"
          ? generateKeyPairSync("ec", { namedCurve: "prime256v1", publicKeyEncoding: { type: "spki", format: "pem" } })
          : generateKeyPairSync("ed25519", { publicKeyEncoding: { type: "spki", format: "pem" } });
      writeFileSync(join(root, "keys", name), pair.publicKey, { mode: 0o644 });
    }
    assert.equal(run("verify", root).status, 0);
    writeFileSync(join(root, "dglaundry-connection.env"), "legacy=true\n", { mode: 0o600 });
    const reapplied = run("prepare", root);
    assert.equal(reapplied.status, 0);
    assert.equal(run("apply", root, ["--confirm"]).status, 0);
    assert.equal(run("rollback", root).status, 0);
    assert.equal(readFileSync(join(root, "dglaundry-connection.env"), "utf8"), "legacy=true\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
