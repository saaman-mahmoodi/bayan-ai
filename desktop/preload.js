const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bayan", {
  processAudio: (payload) => ipcRenderer.invoke("pipeline:process-audio", payload),
  getConfig: () => ipcRenderer.invoke("pipeline:get-config")
});
