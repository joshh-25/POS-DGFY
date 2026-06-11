# DGFY POS Desktop Shell

Windows desktop packaging for the standalone POS surface.

## Local commands

- `npm run build:pos`
- `npm run desktop:pos`
- `npm run build:pos:desktop`

## Runtime config

On first launch, the shell stores:

- `backendOrigin`
- `companyToken`
- `terminalId`

The config file is written into Electron `userData` as `pos-runtime.json`.

## Dev shell

Use a running Vite POS server and set:

- `POS_ELECTRON_RENDERER_URL=http://127.0.0.1:5174`
- optional `POS_ELECTRON_BACKEND_ORIGIN=http://127.0.0.1:5001`
- optional `POS_ELECTRON_COMPANY_TOKEN=token-original`
- optional `POS_ELECTRON_TERMINAL_ID=COUNTER-01`

Then run:

- `npm run desktop:pos`
