const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const APP_TITLE = 'DGFY POS';
const APP_PROTOCOL = 'dgfypos';
const FRONTEND_ROOT = path.resolve(__dirname, '../..');
const PRELOAD_PATH = path.join(__dirname, 'preload.cjs');
const SETUP_PATH = path.join(__dirname, 'setup.html');
const RUNTIME_CONFIG_FILE = 'pos-runtime.json';
const STARTUP_LOG_FILE = 'pos-desktop.log';

let mainWindow = null;
let electronApi = null;

const getElectronApi = () => {
  if (!electronApi) {
    throw new Error('Electron main-process API is not initialized.');
  }
  return electronApi;
};

const getApp = () => getElectronApi().app;
const getProtocol = () => getElectronApi().protocol;

const isDevShell = () => !getApp().isPackaged && Boolean(process.env.POS_ELECTRON_RENDERER_URL);
const getProtocolRoot = () => (getApp().isPackaged ? process.resourcesPath : FRONTEND_ROOT);
const getDistEntryPath = () => (
  getApp().isPackaged
    ? path.join(process.resourcesPath, 'dist', 'index.html')
    : path.join(FRONTEND_ROOT, 'dist', 'index.html')
);

const getRuntimeConfigPath = () => path.join(getApp().getPath('userData'), RUNTIME_CONFIG_FILE);
const getStartupLogPath = () => path.join(getApp().getPath('userData'), STARTUP_LOG_FILE);

const appendStartupLog = (message, details = null) => {
  try {
    const payload = details ? ` ${JSON.stringify(details)}` : '';
    fs.mkdirSync(path.dirname(getStartupLogPath()), { recursive: true });
    fs.appendFileSync(
      getStartupLogPath(),
      `[${new Date().toISOString()}] ${message}${payload}\n`,
      'utf8'
    );
  } catch {
    // Logging must not block app startup.
  }
};

const normalizeBackendOrigin = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only http/https backend URLs are supported.');
    }
    return parsed.origin.replace(/\/+$/, '');
  } catch {
    throw new Error('Enter a valid backend URL, for example http://192.168.1.10:5001');
  }
};

const sanitizeTerminalId = (value = '') => String(value || '')
  .trim()
  .replace(/\s+/g, '-')
  .replace(/[^A-Za-z0-9._-]/g, '')
  .toUpperCase();

const readRuntimeConfig = () => {
  const configPath = getRuntimeConfigPath();
  if (!fs.existsSync(configPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
};

const writeRuntimeConfig = (config) => {
  const configPath = getRuntimeConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
};

const normalizeRuntimeConfig = (raw = {}) => {
  const backendOrigin = normalizeBackendOrigin(raw.backendOrigin);
  const companyToken = String(raw.companyToken || '').trim();
  const terminalId = sanitizeTerminalId(raw.terminalId || '');

  return {
    backendOrigin,
    apiBaseUrl: `${backendOrigin}/api/v1`,
    assetBaseUrl: backendOrigin,
    companyToken,
    terminalId,
    appSurface: 'pos',
    isDesktopShell: true
  };
};

const getWindowRuntimeConfig = () => {
  if (isDevShell()) {
    const backendOrigin = process.env.POS_ELECTRON_BACKEND_ORIGIN || 'http://127.0.0.1:5001';
    const companyToken = process.env.POS_ELECTRON_COMPANY_TOKEN || 'token-original';
    const terminalId = process.env.POS_ELECTRON_TERMINAL_ID || 'COUNTER-01';
    return normalizeRuntimeConfig({ backendOrigin, companyToken, terminalId });
  }

  const stored = readRuntimeConfig();
  if (!stored) return null;

  try {
    return normalizeRuntimeConfig(stored);
  } catch {
    return null;
  }
};

const buildRendererArguments = (runtimeConfig) => {
  const serialized = Buffer.from(JSON.stringify(runtimeConfig || {}), 'utf8').toString('base64');
  return [`--dgfy-pos-runtime=${serialized}`];
};

const registerDesktopProtocol = async () => {
  const protocol = getProtocol();
  if (protocol.isProtocolHandled(APP_PROTOCOL)) return;

  await protocol.handle(APP_PROTOCOL, (request) => {
    try {
      const requestUrl = new URL(request.url);
      const root = path.resolve(getProtocolRoot());
      const requestPath = decodeURIComponent(requestUrl.pathname || '/').replace(/^\/+/, '');
      const candidatePath = path.resolve(root, requestPath);
      const rootPrefix = `${root}${path.sep}`;

      if (candidatePath !== root && !candidatePath.startsWith(rootPrefix)) {
        return new Response('Not found', { status: 404 });
      }

      if (!fs.existsSync(candidatePath)) {
        return new Response('Not found', { status: 404 });
      }

      return net.fetch(pathToFileURL(candidatePath).toString());
    } catch (error) {
      appendStartupLog('protocol-handle-failed', {
        url: request.url,
        message: error?.message || String(error)
      });
      return new Response('Internal error', { status: 500 });
    }
  });
};

const loadRenderer = async (windowInstance, runtimeConfig) => {
  if (isDevShell()) {
    appendStartupLog('loading-dev-renderer', { url: process.env.POS_ELECTRON_RENDERER_URL });
    await windowInstance.loadURL(process.env.POS_ELECTRON_RENDERER_URL);
    return;
  }

  if (!runtimeConfig) {
    appendStartupLog('loading-setup-screen', { setupPath: SETUP_PATH });
    await windowInstance.loadFile(SETUP_PATH);
    return;
  }

  const distEntry = getDistEntryPath();

  if (!fs.existsSync(distEntry)) {
    throw new Error(`POS desktop bundle not found at ${distEntry}. Run "npm run build" first.`);
  }

  const packagedUrl = `${APP_PROTOCOL}://app/dist/index.html#/terminal`;
  appendStartupLog('loading-packaged-pos', { distEntry, url: packagedUrl });
  await windowInstance.loadURL(packagedUrl);
};

const buildAppMenu = () => {
  const template = [
    {
      label: 'DGFY POS',
      submenu: [
        {
          label: 'Reset Connection Settings',
          click: async () => {
            const previousWindow = mainWindow;
            const nextWindow = await createMainWindow({ forceSetup: true });
            mainWindow = nextWindow;
            if (previousWindow && !previousWindow.isDestroyed()) {
              previousWindow.close();
            }
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const createMainWindow = async ({ forceSetup = false } = {}) => {
  const runtimeConfig = forceSetup ? null : getWindowRuntimeConfig();
  appendStartupLog('create-main-window', {
    forceSetup,
    hasRuntimeConfig: Boolean(runtimeConfig),
    isPackaged: getApp().isPackaged,
    frontendRoot: FRONTEND_ROOT,
    distEntry: getDistEntryPath()
  });

  const windowInstance = new getElectronApi().BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    autoHideMenuBar: false,
    title: APP_TITLE,
    backgroundColor: '#f8fafc',
    show: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: buildRendererArguments(runtimeConfig)
    }
  });

  windowInstance.webContents.setWindowOpenHandler(({ url }) => {
    getElectronApi().shell.openExternal(url);
    return { action: 'deny' };
  });

  windowInstance.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    appendStartupLog('renderer-did-fail-load', { errorCode, errorDescription, validatedURL });
  });

  windowInstance.webContents.on('did-finish-load', () => {
    appendStartupLog('renderer-did-finish-load', {
      url: windowInstance.webContents.getURL(),
      title: windowInstance.webContents.getTitle()
    });
  });

  windowInstance.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    appendStartupLog('renderer-console', { level, message, line, sourceId });
  });

  windowInstance.webContents.on('render-process-gone', (_event, details) => {
    appendStartupLog('renderer-process-gone', details);
  });

  windowInstance.on('closed', () => {
    appendStartupLog('window-closed');
  });

  windowInstance.once('ready-to-show', () => {
    appendStartupLog('window-ready-to-show');
    windowInstance.show();
  });

  await loadRenderer(windowInstance, runtimeConfig);
  return windowInstance;
};

const registerIpcHandlers = () => {
  getElectronApi().ipcMain.handle('pos-desktop:get-runtime-config', async () => getWindowRuntimeConfig());

  getElectronApi().ipcMain.handle('pos-desktop:save-runtime-config', async (_event, payload = {}) => {
    const normalized = normalizeRuntimeConfig(payload);
    writeRuntimeConfig(normalized);

    if (mainWindow && !mainWindow.isDestroyed()) {
      const nextWindow = await createMainWindow();
      const previousWindow = mainWindow;
      mainWindow = nextWindow;
      previousWindow.close();
    }

    return normalized;
  });

  getElectronApi().ipcMain.handle('pos-desktop:clear-runtime-config', async () => {
    const configPath = getRuntimeConfigPath();
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
    return { success: true };
  });
};

const bootstrap = async () => {
  const imported = await import('electron/main');
  electronApi = imported?.default || imported;
  const app = getApp();

  getProtocol().registerSchemesAsPrivileged([
    {
      scheme: APP_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ]);

  registerIpcHandlers();

  await app.whenReady();
  appendStartupLog('app-ready', { userData: app.getPath('userData') });
  app.setAppUserModelId('com.dgfy.pos');
  await registerDesktopProtocol();
  buildAppMenu();
  mainWindow = await createMainWindow();

  app.on('activate', async () => {
    if (getElectronApi().BrowserWindow.getAllWindows().length === 0) {
      mainWindow = await createMainWindow();
    }
  });
};

bootstrap().catch((error) => {
  appendStartupLog('startup-failed', {
    message: error?.message || String(error),
    stack: error?.stack || null
  });
  console.error('[pos-electron] Failed to start desktop shell:', error);
  if (electronApi?.app) {
    electronApi.app.quit();
  }
});

process.on('uncaughtException', (error) => {
  appendStartupLog('uncaught-exception', {
    message: error?.message || String(error),
    stack: error?.stack || null
  });
});
