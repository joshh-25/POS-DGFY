# Local development credentials

This file intentionally contains no passwords, tokens, JWT secrets, or database
credentials. Do not store credentials in the repository or in source-code audit
archives.

Use the local environment files and test-seeding scripts to configure a development
database. Copy values from the appropriate `.env.*.example` file into an ignored
local `.env` file, then set test account passwords and company tokens through
environment variables or the local seed/reset scripts.

If a credential has ever been committed or included in an archive, treat it as
exposed and rotate it before using the environment for anything other than local
development.

For source-code audit packages, run:

```text
npm run audit:archive
```

The archive command includes the application source and contract tests while
excluding credential documents, environment files, browser session state, private
uploads, generated bundles, and dependency trees.
