const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getTradingPairs: () => ipcRenderer.invoke('get-trading-pairs'),
});
