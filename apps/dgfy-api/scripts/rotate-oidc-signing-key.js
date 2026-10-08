#!/usr/bin/env node
import fs from 'node:fs';
import { sequelize, OidcSigningKey } from '../src/models/index.js';
import { oidcSigningKeyRepository } from '../src/modules/dgfyLaundry/repositories/oidcSigningKeyRepository.js';
import { promoteKey, retireKey, revokeKey } from '../src/modules/dgfyLaundry/services/oidcSigningKeyRegistry.js';

const [command, ...args] = process.argv.slice(2);
const option = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
};

try {
    if (command === 'add') {
        const kid = option('--kid');
        const publicKeyFile = option('--public-key-file');
        const privateKeyEnvRef = option('--private-key-env-ref');
        if (!kid || !publicKeyFile || !privateKeyEnvRef || !process.env[privateKeyEnvRef]) {
            throw new Error('Usage: add --kid <kid> --public-key-file <path> --private-key-env-ref <env-var-name> (the env var must resolve the private-key file)');
        }
        const publicKeyPem = fs.readFileSync(publicKeyFile, 'utf8').trim();
        await oidcSigningKeyRepository.create({ kid, publicKeyPem, privateKeyEnvRef });
        console.log(`Added retiring OIDC signing key ${kid}.`);
    } else if (command === 'promote' || command === 'retire' || command === 'revoke') {
        const kid = option('--kid') || args[0];
        if (!kid) throw new Error(`Usage: ${command} --kid <kid>`);
        if (command === 'promote') await promoteKey({ kid });
        else if (command === 'retire') await retireKey({ kid });
        else await revokeKey({ kid });
        console.log(`${command}d OIDC signing key ${kid}.`);
    } else if (command === 'list') {
        const rows = await OidcSigningKey.findAll({ attributes: ['kid', 'status', 'activated_at', 'retired_at', 'revoked_at'], order: [['created_at', 'ASC']] });
        for (const row of rows) console.log(`${row.kid}\t${row.status}\t${row.activated_at || ''}\t${row.retired_at || ''}\t${row.revoked_at || ''}`);
    } else {
        throw new Error('Usage: rotate-oidc-signing-key.js <add|list|promote|retire|revoke> [options]');
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await sequelize.close();
}
