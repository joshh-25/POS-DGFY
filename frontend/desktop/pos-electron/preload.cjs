const { contextBridge, ipcRenderer } = require('electron');

const runtimeArg = process.argv.find((entry) => entry.startsWith('--dgfy-pos-runtime='));
let runtimeConfig = {};

if (runtimeArg) {
  try {
    const encoded = runtimeArg.slice('--dgfy-pos-runtime='.length);
    runtimeConfig = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    runtimeConfig = {};
  }
}

contextBridge.exposeInMainWorld('__DGFY_POS_RUNTIME__', {
  ...runtimeConfig,
  isDesktopShell: true
});

contextBridge.exposeInMainWorld('posDesktop', {
  isDesktopShell: true,
  getRuntimeConfig: () => ipcRenderer.invoke('pos-desktop:get-runtime-config'),
  saveRuntimeConfig: (payload) => ipcRenderer.invoke('pos-desktop:save-runtime-config', payload),
  clearRuntimeConfig: () => ipcRenderer.invoke('pos-desktop:clear-runtime-config')
});

