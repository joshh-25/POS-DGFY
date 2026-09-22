# DGFY POS Desktop Shell

Windows desktop packaging for the standalone POS surface.

## Local commands

- `npm run build`
- `npm run desktop:pos`
- `npm run build:desktop`

## Runtime config

On first launch, the shell stores:

- `backendOrigin`
- `companyToken`
- `terminalId`

The config file is written into Electron `userData` as `pos-runtime.json`.

## Dev shell

Use a running Vite POS server and set:

- `POS_ELECTRON_RENDERER_URL=http://127.0.0.1:5174`
- optional `POS_ELECTRON_BACKEND_ORIGIN=http://127.0.0.1:5000`
- optional `POS_ELECTRON_COMPANY_TOKEN=<tenant-company-token>`
- optional `POS_ELECTRON_TERMINAL_ID=<terminal-id>`

The optional tenant and terminal values must be supplied through local, ignored
environment configuration. When they are omitted, the renderer uses its normal
sign-in and terminal-selection flow; no repository default is injected.

Then run:

- `npm run desktop:pos`
