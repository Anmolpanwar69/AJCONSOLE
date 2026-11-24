/**
 * FX Console — Screenshot Gallery
 * =================================
 * Manages captured frame snapshots for A/B comparison.
 * Stores thumbnails and metadata in localStorage, full images on disk.
 */

var FXGallery = (function () {
    "use strict";

    var STORAGE_KEY = "fxconsole_gallery";
    var MAX_SNAPSHOTS = 50;

    /** @type {Array<Object>} — Snapshot entries */
    var _snapshots = [];

    /** @type {string} — Base directory for saved screenshots */
    var _outputDir = "";

    /** @type {function|null} — UI update callback */
    var _onChange = null;

    // ── Persistence ─────────────────────────────────────────────

    function _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(_snapshots));
        } catch (e) {}
        if (typeof _onChange === "function") _onChange(_snapshots);
    }

    function load() {
        try {
            var data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                _snapshots = JSON.parse(data) || [];
            }
        } catch (e) {
            _snapshots = [];
        }
    }

    // ── Configuration ───────────────────────────────────────────

    /**
     * Set the output directory for captured frames.
     * @param {string} dir — Absolute path to the screenshot directory
     */
    function setOutputDir(dir) {
        _outputDir = dir;
    }

    function getOutputDir() {
        return _outputDir;
    }

    // ── Capture ─────────────────────────────────────────────────

    /**
     * Capture the current frame using the host ExtendScript.
     * @param {CSInterface} csInterface — CEP interface instance
     * @param {function} callback — Receives { success, path, error }
     */
    function captureFrame(csInterface, callback) {
        if (!_outputDir) {
            callback({ success: false, error: "Output directory not set." });
            return;
        }

        var script = 'captureFrame("' + _outputDir.replace(/\\/g, "/") + '")';
        csInterface.evalScript(script, function (resultStr) {
            try {
                var result = JSON.parse(resultStr);
                if (result.success) {
                    var snapshot = {
                        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                        path: result.path,
                        timestamp: new Date().toISOString(),
                        label: "",
                        pinned: false
                    };
                    _snapshots.unshift(snapshot);

                    // Enforce max limit
                    if (_snapshots.length > MAX_SNAPSHOTS) {
                        _snapshots = _snapshots.slice(0, MAX_SNAPSHOTS);
                    }

                    _save();
                    result.snapshot = snapshot;
                }
                callback(result);
            } catch (e) {
                callback({ success: false, error: "Parse error: " + e.message });
            }
        });
    }

    // ── Gallery Management ──────────────────────────────────────

    /**
     * Get all snapshots, newest first.
     * @returns {Array<Object>}
     */
    function getAll() {
        return _snapshots.slice();
    }

    /**
     * Get a specific snapshot by ID.
     */
    function getById(id) {
        for (var i = 0; i < _snapshots.length; i++) {
            if (_snapshots[i].id === id) return _snapshots[i];
        }
        return null;
    }

    /**
     * Delete a snapshot by ID.
     */
    function remove(id) {
        _snapshots = _snapshots.filter(function (s) { return s.id !== id; });
        _save();
    }

    /**
     * Clear the entire gallery.
     */
    function clearAll() {
        _snapshots = [];
        _save();
    }

    /**
     * Label / rename a snapshot.
     */
    function setLabel(id, label) {
        var snap = getById(id);
        if (snap) {
            snap.label = label;
            _save();
        }
    }

    /**
     * Pin / unpin a snapshot (pinned snapshots aren't auto-deleted).
     */
    function togglePin(id) {
        var snap = getById(id);
        if (snap) {
            snap.pinned = !snap.pinned;
            _save();
        }
    }

    /**
     * Get pinned snapshots.
     */
    function getPinned() {
        return _snapshots.filter(function (s) { return s.pinned; });
    }

    /**
     * Copy a snapshot path to clipboard (delegates to Node.js in CEP).
     * @param {string} imagePath — Path to the PNG file
     * @param {function} callback
     */
    function copyToClipboard(imagePath, callback) {
        try {
            // Use Node.js child_process in CEP environment to copy to clipboard
            var cp = require("child_process");
            // Windows: use PowerShell to copy image to clipboard
            var cmd = 'powershell -command "Set-Clipboard -Path \'' +
                      imagePath.replace(/'/g, "''") + '\'"';
            cp.exec(cmd, function (err) {
                if (callback) {
                    callback(err ? { success: false, error: err.message } : { success: true });
                }
            });
        } catch (e) {
            if (callback) callback({ success: false, error: e.message });
        }
    }

    /**
     * Register a change callback for UI updates.
     */
    function onChange(callback) {
        _onChange = callback;
    }

    /**
     * Get snapshot count.
     */
    function getCount() {
        return _snapshots.length;
    }

    // ── Initialize ──────────────────────────────────────────────
    load();

    return {
        setOutputDir: setOutputDir,
        getOutputDir: getOutputDir,
        captureFrame: captureFrame,
        getAll: getAll,
        getById: getById,
        remove: remove,
        clearAll: clearAll,
        setLabel: setLabel,
        togglePin: togglePin,
        getPinned: getPinned,
        copyToClipboard: copyToClipboard,
        onChange: onChange,
        getCount: getCount,
        load: load
    };

})();
