import fs from 'node:fs';

/**
 * Resolve one OIDC signing key from an inline value or a file path.
 * Inline configuration takes precedence. Diagnostics include only the path
 * and an error code; key material is never logged.
 */
export const resolveSigningKeyMaterial = ({ inlineEnvVar, fileEnvVar, label }) => {
  const inline = String(process.env[inlineEnvVar] || '').trim();
  if (inline) {
    return { pem: inline, source: 'inline', filePath: null, errorCode: null };
  }

  const filePath = String(process.env[fileEnvVar] || '').trim();
  if (!filePath) {
    return { pem: '', source: 'unset', filePath: null, errorCode: null };
  }

  try {
    const pem = fs.readFileSync(filePath, 'utf8').trim();
    if (!pem) {
      console.warn('[OidcSigningKeyResolver] Configured key file is empty', {
        label,
        filePath,
        errorCode: 'EMPTY_FILE'
      });
      return { pem: '', source: 'empty_file', filePath, errorCode: 'EMPTY_FILE' };
    }
    return { pem, source: 'file', filePath, errorCode: null };
  } catch (error) {
    const errorCode = error?.code || 'READ_FAILED';
    console.warn('[OidcSigningKeyResolver] Configured key file could not be read', {
      label,
      filePath,
      errorCode
    });
    return { pem: '', source: 'unreadable', filePath, errorCode };
  }
};
