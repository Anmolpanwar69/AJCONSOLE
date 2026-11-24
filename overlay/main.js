/**
 * FX Console Overlay — Electron Main Process
 * =============================================
 * Registers a global hotkey (Ctrl+Space) scoped to Premiere Pro.
 * Opens a frameless, transparent overlay window at the cursor position.
 * Communicates with the CEP extension's IPC server via HTTP.
 */

const { app, BrowserWindow, globalShortcut, screen, ipcMain, Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");
const { spawn } = require("child_process");

const logFile = path.join(__dirname, "overlay.log");
function log(msg) {
    try {
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
    } catch (e) {}
}
log("Main process script loaded.");

process.on("uncaughtException", (err) => {
    log("UNCAUGHT EXCEPTION: " + (err ? err.stack : err));
});
process.on("unhandledRejection", (err) => {
    log("UNHANDLED REJECTION: " + (err ? err.stack : err));
});

// ── Configuration ───────────────────────────────────────────────

const CEP_PORT = 39471;            // Port where the CEP extension's IPC server runs
const CEP_HOST = "127.0.0.1";
const OVERLAY_WIDTH = 420;
const OVERLAY_HEIGHT = 215;

let overlayWindow = null;
let tray = null;
let effectsCache = [];
let isVisible = false;
let lastShowTime = 0;
let hookProcess = null;

let isQuitting = false;

// ── App Lifecycle ───────────────────────────────────────────────

app.whenReady().then(() => {
    log("app.whenReady reached.");
    try {
        createTray();
        log("createTray done.");
        createOverlayWindow();
        log("createOverlayWindow done.");
        startNativeHook();
        log("startNativeHook done.");
        startControlServer();
        log("startControlServer done.");
        fetchEffects();
        log("fetchEffects called.");
        startPremiereWatcher();
        log("startPremiereWatcher started.");

        setInterval(fetchEffects, 30000);
    } catch (e) {
        log("ERROR in whenReady: " + e.stack);
    }
});

app.on("will-quit", () => {
    isQuitting = true;
    stopNativeHook();
    globalShortcut.unregisterAll();
});

app.on("before-quit", () => {
    isQuitting = true;
    stopNativeHook();
});

// ── Low-Level Native Keyboard Hook ──────────────────────────────

function startNativeHook() {
    if (isQuitting) return;
    const fs = require("fs");
    const hookExe = path.join(__dirname, "hook", "fxconsole-hook.exe");
    if (!fs.existsSync(hookExe)) {
        console.log("Native hook executable not found at:", hookExe);
        return;
    }

    try {
        hookProcess = spawn(hookExe, [], {
            detached: false,
            windowsHide: true,
            stdio: "ignore"
        });

        console.log("Native WH_KEYBOARD_LL hook active (PID: " + hookProcess.pid + ")");

        hookProcess.on("exit", (code) => {
            console.log("Hook process exited with code:", code);
            hookProcess = null;
            if (!isQuitting) {
                setTimeout(startNativeHook, 2000);
            }
        });
    } catch (e) {
        console.log("Error starting hook process:", e.message);
    }
}

function stopNativeHook() {
    if (hookProcess) {
        try {
            hookProcess.kill();
        } catch (e) {}
        hookProcess = null;
    }
}

app.on("window-all-closed", (e) => {
    e.preventDefault();  // Keep app running in tray
});

// ── System Tray ─────────────────────────────────────────────────

function createTray() {
    const icon = nativeImage.createEmpty();
    tray = new Tray(icon);

    const contextMenu = Menu.buildFromTemplate([
        { label: "AJ Console Overlay", enabled: false },
        { type: "separator" },
        {
            label: "Show Overlay (Ctrl+Space)",
            click: () => toggleOverlay()
        },
        {
            label: "Refresh Effects",
            click: () => fetchEffects()
        },
        { type: "separator" },
        {
            label: "Quit",
            click: () => {
                app.quit();
                process.exit(0);
            }
        }
    ]);

    tray.setToolTip("AJ Console Overlay");
    tray.setContextMenu(contextMenu);
    tray.on("click", () => toggleOverlay());
}

// ── Overlay Window ──────────────────────────────────────────────

function createOverlayWindow() {
    overlayWindow = new BrowserWindow({
        title: "AJ Console Overlay",
        width: OVERLAY_WIDTH,
        height: OVERLAY_HEIGHT,
        show: false,
        frame: false,
        transparent: true,
        backgroundColor: "#00000000",
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: true,
        hasShadow: true,
        focusable: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    overlayWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

    overlayWindow.on("blur", () => {
        const elapsed = Date.now() - lastShowTime;
        log(`overlayWindow 'blur' event fired (elapsed: ${elapsed}ms).`);
        // Ignore blur during the initial 600ms transient while window is showing and gaining focus
        if (elapsed < 600) {
            log(`Ignoring blur because elapsed (${elapsed}ms) < 600ms.`);
            return;
        }
        log("Hiding overlay due to blur.");
        hideOverlay();
    });

    overlayWindow.on("focus", () => {
        log("overlayWindow 'focus' event fired.");
    });

    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

// ── Premiere Pro Lifecycle Watcher ──────────────────────────────
// Automatically quits the overlay and hook when Premiere Pro is closed.
// Global OS hotkeys are intentionally disabled here; fxconsole-hook.exe
// intercepts Ctrl+Space ONLY when Premiere Pro is the active foreground window.

let pproCheckTimer = null;
let pproFoundOnce = false;
let pproMissingCount = 0;

function startPremiereWatcher() {
    pproCheckTimer = setInterval(checkPremiereProcess, 2500);
    checkPremiereProcess();
}

function checkPremiereProcess() {
    if (isQuitting) return;
    const { exec } = require("child_process");
    exec('tasklist /FI "IMAGENAME eq Adobe Premiere Pro.exe" /NH', { windowsHide: true }, (err, stdout) => {
        if (err) return;
        const isRunning = stdout && stdout.toLowerCase().includes("premiere");

        if (isRunning) {
            pproFoundOnce = true;
            pproMissingCount = 0;
        } else {
            pproMissingCount++;
            // If Premiere Pro was running and just closed, OR wasn't running for ~12 seconds:
            if (pproFoundOnce || pproMissingCount >= 5) {
                log("Premiere Pro is closed/not running. Shutting down AJ Console overlay.");
                quitOverlay();
            }
        }
    });
}

function quitOverlay() {
    if (isQuitting) return;
    isQuitting = true;
    if (pproCheckTimer) clearInterval(pproCheckTimer);
    stopNativeHook();
    if (overlayWindow) {
        try { overlayWindow.destroy(); } catch (e) {}
    }
    try { app.quit(); } catch (e) {}
    setTimeout(() => {
        process.exit(0);
    }, 300);
}

// ── Overlay Visibility ──────────────────────────────────────────

function toggleOverlay() {
    if (isVisible) {
        hideOverlay();
    } else {
        showOverlay();
    }
}

function showOverlay() {
    if (!overlayWindow) {
        log("showOverlay called but overlayWindow is null.");
        return;
    }

    lastShowTime = Date.now();
    log("showOverlay called. Current visibility: " + isVisible);

    // Position at cursor
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const bounds = display.workArea;

    const currentSize = overlayWindow.getSize();
    const curW = currentSize[0] || OVERLAY_WIDTH;
    const curH = currentSize[1] || OVERLAY_HEIGHT;

    let x = cursor.x - Math.floor(curW / 2);
    let y = cursor.y - 40; // Slightly above cursor

    // Keep within screen bounds
    x = Math.max(bounds.x, Math.min(x, bounds.x + bounds.width - curW));
    y = Math.max(bounds.y, Math.min(y, bounds.y + bounds.height - curH));

    log(`Setting window position to x: ${x}, y: ${y}, w: ${curW}, h: ${curH}`);
    overlayWindow.setPosition(x, y);
    overlayWindow.setAlwaysOnTop(true, "normal");
    overlayWindow.show();
    overlayWindow.restore();
    overlayWindow.focus();
    overlayWindow.webContents.focus();
    app.focus({ steal: true });
    isVisible = true;

    // Tell renderer to focus search input and refresh
    overlayWindow.webContents.send("overlay-show", { effects: effectsCache });
    overlayWindow.webContents.executeJavaScript('const el = document.getElementById("overlaySearchInput"); if (el) { el.focus(); el.select(); }').catch(() => {});
    log("showOverlay completed.");
}

function hideOverlay() {
    if (!overlayWindow) return;
    log("hideOverlay called.");
    overlayWindow.hide();
    isVisible = false;

    // Tell renderer to reset
    overlayWindow.webContents.send("overlay-hide");
}

// ── CEP Communication ───────────────────────────────────────────

let activeCepPort = CEP_PORT;

function cepRequest(method, reqPath, body) {
    function tryPort(port) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: CEP_HOST,
                port: port,
                path: reqPath,
                method: method,
                headers: { "Content-Type": "application/json" },
                timeout: 3000
            };

            const req = http.request(options, (res) => {
                let data = "";
                res.on("data", (chunk) => { data += chunk; });
                res.on("end", () => {
                    activeCepPort = port;
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve(data);
                    }
                });
            });

            req.on("error", (err) => {
                reject(err);
            });

            req.on("timeout", () => {
                req.destroy();
                reject(new Error("Request timed out"));
            });

            if (body) {
                req.write(JSON.stringify(body));
            }
            req.end();
        });
    }

    return tryPort(activeCepPort).catch(() => {
        const altPort = activeCepPort === 39471 ? 39472 : 39471;
        return tryPort(altPort);
    });
}

// ── Overlay HTTP Control Server ──────────────────────────────────
function startControlServer() {
    try {
        const server = http.createServer((req, res) => {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Content-Type", "application/json");

            if (req.url === "/show") {
                showOverlay();
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, isVisible: true }));
                return;
            }
            if (req.url === "/hide") {
                hideOverlay();
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, isVisible: false }));
                return;
            }
            if (req.url === "/toggle") {
                toggleOverlay();
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, isVisible }));
                return;
            }
            if (req.url === "/status") {
                res.writeHead(200);
                res.end(JSON.stringify({ running: true, isVisible, effectsCount: effectsCache.length }));
                return;
            }
            res.writeHead(404);
            res.end(JSON.stringify({ error: "Not found" }));
        });

        server.listen(39473, "127.0.0.1", () => {
            log("Overlay control server listening on 39473");
        });
        server.on("error", (e) => {
            log("CONTROL SERVER ERROR: " + e.message);
        });
    } catch (e) {
        console.log("Control server error:", e.message);
    }
}

function fetchEffects() {
    cepRequest("GET", "/effects")
        .then((effects) => {
            if (Array.isArray(effects)) {
                effectsCache = effects;
                console.log(`Loaded ${effects.length} effects from CEP`);
                if (overlayWindow) {
                    overlayWindow.webContents.send("effects-updated", effectsCache);
                }
            }
        })
        .catch((err) => {
            console.log("CEP not ready:", err.message);
        });
}

// ── IPC Handlers (Renderer → Main) ─────────────────────────────

ipcMain.handle("set-height", (event, newHeight) => {
    if (overlayWindow) {
        const clamped = Math.max(42, Math.min(Math.round(newHeight), 380));
        const [w, h] = overlayWindow.getSize();
        if (h !== clamped) {
            overlayWindow.setSize(OVERLAY_WIDTH, clamped);
        }
    }
});

ipcMain.handle("apply-effect", async (event, effectData) => {
    try {
        const result = await cepRequest("POST", "/apply", effectData);
        return result;
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle("apply-favorite", async (event, slotNumber) => {
    try {
        const result = await cepRequest("POST", "/favorite", { slot: slotNumber });
        return result;
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle("capture-frame", async () => {
    try {
        const result = await cepRequest("POST", "/capture");
        return result;
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle("get-status", async () => {
    try {
        const result = await cepRequest("GET", "/status");
        return result;
    } catch (err) {
        return { ready: false, error: err.message };
    }
});

ipcMain.handle("hide-overlay", () => {
    hideOverlay();
});

ipcMain.handle("get-effects", () => {
    return effectsCache;
});
