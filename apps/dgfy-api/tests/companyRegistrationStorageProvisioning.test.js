import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

describe('company registration private storage provisioning', () => {
  it('creates and persists the private storage directory in API and deployment compose config', () => {
    const dockerfile = read('infrastructure/docker/dgfy-api/Dockerfile');
    const entrypoint = read('infrastructure/docker/dgfy-api/entrypoint.sh');
    const composeFiles = [
      'infrastructure/docker/docker-compose.api.yml',
      'infrastructure/docker/env/stage.compose-fragment.yml',
      'infrastructure/docker/env/prod.compose-fragment.yml',
      'infrastructure/docker/env/prod.sops-cutover-fragment.yml'
    ].map(read);

    expect(dockerfile).toContain('private-uploads/company-registration');
    expect(entrypoint).toContain('private-uploads/company-registration');
    expect(entrypoint).toContain('chown -R app:app uploads storage logs private-uploads');
    for (const compose of composeFiles) {
      expect(compose).toContain('COMPANY_REGISTRATION_PRIVATE_STORAGE_DIR: /app/private-uploads/company-registration');
      expect(compose).toContain('./data/dgfy-api/private-uploads:/app/private-uploads');
    }
  });

  it('does not expose the private directory through nginx configuration', () => {
    const nginxConfig = read('infrastructure/docker/nginx/nginx.conf.template');
    expect(nginxConfig).not.toContain('private-uploads');
  });
});
