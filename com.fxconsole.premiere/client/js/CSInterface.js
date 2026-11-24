/**
 * CSInterface.js — Adobe CEP Interface Library
 * =============================================
 * Minimal compatible implementation of Adobe's CSInterface for CEP extensions.
 * Delegates all calls to window.__adobe_cep__ (injected by the CEP runtime).
 *
 * Based on the Adobe CEP SDK (MIT License).
 * https://github.com/nicholaslee/Adobe-CEP-Samples
 */

/* global window */

/** System path type constants */
var SystemPath = {
    USER_DATA:        "userData",
    COMMON_FILES:     "commonFiles",
    MY_DOCUMENTS:     "myDocuments",
    APPLICATION:      "application",
    EXTENSION:        "extension",
    HOST_APPLICATION:  "hostApplication"
};

/** Color type constants */
var ColorType = {
    RGB:  "rgb",
    GRADIENT: "gradient",
    NONE: "none"
};

/** CEP version (matches manifest RequiredRuntime) */
var CEP_VERSION = 11;

// ─── CSEvent ─────────────────────────────────────────────────────────

/**
 * @constructor
 */
function CSEvent(type, scope, appId, extensionId) {
    this.type = type || "";
    this.scope = scope || "APPLICATION";
    this.appId = appId || "";
    this.extensionId = extensionId || "";
    this.data = "";
}

// ─── CSInterface ─────────────────────────────────────────────────────

/**
 * @constructor
 */
function CSInterface() {}

/**
 * Retrieves the host environment data.
 * @returns {Object} Host environment data including app name, version, etc.
 */
CSInterface.prototype.getHostEnvironment = function () {
    try {
        var env = window.__adobe_cep__.getHostEnvironment();
        return JSON.parse(env);
    } catch (e) {
        return null;
    }
};

/**
 * Retrieves a system path by type.
 * @param {string} pathType — One of the SystemPath constants.
 * @returns {string} The file system path.
 */
CSInterface.prototype.getSystemPath = function (pathType) {
    try {
        var path = decodeURI(window.__adobe_cep__.getSystemPath(pathType));
        var os = this.getOSInformation();
        if (os && os.indexOf("Windows") >= 0) {
            path = path.replace("file:///", "");
        } else {
            path = path.replace("file://", "");
        }
        return path;
    } catch (e) {
        return "";
    }
};

/**
 * Evaluates an ExtendScript expression in the host application.
 * @param {string} script   — ExtendScript code string.
 * @param {function} callback — Receives the script's return value.
 */
CSInterface.prototype.evalScript = function (script, callback) {
    if (typeof callback !== "function") {
        callback = function () {};
    }
    try {
        window.__adobe_cep__.evalScript(script, callback);
    } catch (e) {
        callback("EvalScript Error: " + e.message);
    }
};

/**
 * Registers a listener for a CSEvent.
 * @param {string} type       — Event type string.
 * @param {function} listener — Event handler function.
 * @param {object} obj        — Optional listener object for context.
 */
CSInterface.prototype.addEventListener = function (type, listener, obj) {
    try {
        window.__adobe_cep__.addEventListener(type, listener, obj);
    } catch (e) {
        // Silently fail — event system may not be available
    }
};

/**
 * Removes a previously registered event listener.
 */
CSInterface.prototype.removeEventListener = function (type, listener, obj) {
    try {
        window.__adobe_cep__.removeEventListener(type, listener, obj);
    } catch (e) {}
};

/**
 * Dispatches a CSEvent.
 * @param {CSEvent} event — The event to dispatch.
 */
CSInterface.prototype.dispatchEvent = function (event) {
    if (typeof event.data === "object") {
        event.data = JSON.stringify(event.data);
    }
    try {
        window.__adobe_cep__.dispatchEvent(event);
    } catch (e) {}
};

/**
 * Opens a URL in the default browser.
 * @param {string} url — URL to open.
 */
CSInterface.prototype.openURLInDefaultBrowser = function (url) {
    try {
        if (typeof cep !== "undefined" && cep.util) {
            cep.util.openURLInDefaultBrowser(url);
        } else {
            window.__adobe_cep__.invokeSync("openURLInDefaultBrowser", url);
        }
    } catch (e) {}
};

/**
 * Retrieves the extension's unique ID.
 */
CSInterface.prototype.getExtensionID = function () {
    return this.getHostEnvironment()
        ? this.getHostEnvironment().extensionId || ""
        : "";
};

/**
 * Closes this extension panel.
 */
CSInterface.prototype.closeExtension = function () {
    try {
        window.__adobe_cep__.closeExtension();
    } catch (e) {}
};

/**
 * Requests opening another extension panel by ID.
 */
CSInterface.prototype.requestOpenExtension = function (extensionId, params) {
    try {
        window.__adobe_cep__.requestOpenExtension(extensionId, params || "");
    } catch (e) {}
};

/**
 * Returns a string describing the OS.
 */
CSInterface.prototype.getOSInformation = function () {
    var ua = navigator.userAgent;
    if (ua.indexOf("Windows") >= 0) return "Windows";
    if (ua.indexOf("Mac OS") >= 0) return "Mac OS";
    return ua;
};

/**
 * Returns the current API version.
 */
CSInterface.prototype.getCurrentApiVersion = function () {
    try {
        var v = JSON.parse(window.__adobe_cep__.getCurrentApiVersion());
        return v;
    } catch (e) {
        return { major: CEP_VERSION, minor: 0, micro: 0 };
    }
};

/**
 * Sets panel flyout menu XML.
 */
CSInterface.prototype.setPanelFlyoutMenu = function (menu) {
    try {
        window.__adobe_cep__.invokeSync("setPanelFlyoutMenu", menu);
    } catch (e) {}
};

/**
 * Registers a theme change listener.
 */
CSInterface.prototype.addThemeColorChangedEventListener = function (callback) {
    this.addEventListener("com.adobe.csxs.events.ThemeColorChanged", callback);
};

/**
 * Returns the host application's current theme colors.
 */
CSInterface.prototype.getThemeColor = function () {
    try {
        return JSON.parse(window.__adobe_cep__.getHostEnvironment()).appSkinInfo;
    } catch (e) {
        return null;
    }
};

/**
 * Persist data across sessions for this extension.
 */
CSInterface.prototype.setPreference = function (key, value) {
    try {
        localStorage.setItem("fxconsole_" + key, JSON.stringify(value));
    } catch (e) {}
};

CSInterface.prototype.getPreference = function (key, defaultValue) {
    try {
        var val = localStorage.getItem("fxconsole_" + key);
        return val !== null ? JSON.parse(val) : defaultValue;
    } catch (e) {
        return defaultValue;
    }
};
