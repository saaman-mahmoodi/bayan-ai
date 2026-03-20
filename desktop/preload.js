const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bayan", {
  register: (payload) => ipcRenderer.invoke("auth:register", payload),
  login: (payload) => ipcRenderer.invoke("auth:login", payload),
  logout: (payload) => ipcRenderer.invoke("auth:logout", payload),
  me: (payload) => ipcRenderer.invoke("auth:me", payload),
  updatePreferences: (payload) => ipcRenderer.invoke("profile:update-preferences", payload),
  listSessions: (payload) => ipcRenderer.invoke("sessions:list", payload),
  getSessionTurns: (payload) => ipcRenderer.invoke("sessions:get-turns", payload),
  processAudio: (payload) => ipcRenderer.invoke("pipeline:process-audio", payload),
  getConfig: () => ipcRenderer.invoke("pipeline:get-config")
});
