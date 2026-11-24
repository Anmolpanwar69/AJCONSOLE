/**
 * AJ Console Overlay — Preload Script
 * =====================================
 * Safely exposes IPC channels to the renderer process.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fxConsole", {
    // ── Effects ─────────────────────────────────
    getEffects: () => ipcRenderer.invoke("get-effects"),
    applyEffect: (effectData) => ipcRenderer.invoke("apply-effect", effectData),
    applyFavorite: (slot) => ipcRenderer.invoke("apply-favorite", slot),
    captureFrame: () => ipcRenderer.invoke("capture-frame"),
    getStatus: () => ipcRenderer.invoke("get-status"),

    // ── Overlay control ─────────────────────────
    hideOverlay: () => ipcRenderer.invoke("hide-overlay"),
    setHeight: (height) => ipcRenderer.invoke("set-height", height),

    // ── Events from main process ────────────────
    onShow: (callback) => {
        ipcRenderer.on("overlay-show", (event, data) => callback(data));
    },
    onHide: (callback) => {
        ipcRenderer.on("overlay-hide", (event) => callback());
    },
    onEffectsUpdated: (callback) => {
        ipcRenderer.on("effects-updated", (event, effects) => callback(effects));
    }
});
