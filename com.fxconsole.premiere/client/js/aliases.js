/**
 * FX Console — Custom Aliases Manager
 * =====================================
 * Manage short keyword → effect name mappings.
 * Default aliases for common Premiere Pro effects + user-defined aliases.
 */

var FXAliases = (function () {
    "use strict";

    var STORAGE_KEY = "fxconsole_aliases";

    /** Built-in default aliases (user can override these) */
    var DEFAULT_ALIASES = {
        // ── Color & Grading ──────────────────────────
        "lum":      "Lumetri Color",
        "lumetri":  "Lumetri Color",
        "color":    "Lumetri Color",
        "grade":    "Lumetri Color",
        "curves":   "Curves (Obsolete)",
        "levels":   "Levels",
        "bc":       "Brightness & Contrast",
        "bright":   "Brightness & Contrast",
        "tint":     "Tint",
        "expo":     "Exposure",

        // ── Blur & Sharpen ───────────────────────────
        "blur":     "Gaussian Blur",
        "gblur":    "Gaussian Blur",
        "gauss":    "Gaussian Blur",
        "dblur":    "Directional Blur",
        "sharp":    "Sharpen",
        "unsharpm": "Unsharp Mask",

        // ── Distortion ──────────────────────────────
        "warp":     "Warp Stabilizer",
        "stab":     "Warp Stabilizer",
        "stabilize":"Warp Stabilizer",
        "lens":     "Lens Distortion",
        "corner":   "Corner Pin",
        "spherize": "Spherize",

        // ── Transform / Motion ──────────────────────
        "crop":     "Crop",
        "flip":     "Horizontal Flip",
        "vflip":    "Vertical Flip",
        "transform":"Transform",

        // ── Generate ────────────────────────────────
        "title":    "Basic 3D",
        "noise":    "Noise",
        "solid":    "Color Matte",

        // ── Video Transitions ───────────────────────
        "diss":     "Cross Dissolve",
        "dissolve": "Cross Dissolve",
        "xdiss":    "Cross Dissolve",
        "dip":      "Dip to Black",
        "dipb":     "Dip to Black",
        "dipw":     "Dip to White",
        "wipe":     "Wipe",
        "push":     "Push",
        "slide":    "Slide",
        "morph":    "Morph Cut",
        "mc":       "Morph Cut",

        // ── Audio Effects ───────────────────────────
        "denoise":  "DeNoise",
        "dn":       "DeNoise",
        "eq":       "Parametric Equalizer",
        "comp":     "Dynamics",
        "reverb":   "Reverb",
        "delay":    "Delay",
        "vol":      "Volume",

        // ── Audio Transitions ───────────────────────
        "xfade":    "Constant Power",
        "fade":     "Constant Power",
        "cp":       "Constant Power",
        "cg":       "Constant Gain",

        // ── Key & Matte ─────────────────────────────
        "ultra":    "Ultra Key",
        "chroma":   "Ultra Key",
        "green":    "Ultra Key",
        "key":      "Ultra Key",
        "luma":     "Luma Key",
        "track":    "Track Matte Key",
        "matte":    "Track Matte Key"
    };

    /** @type {Object} — Merged aliases (defaults + user overrides) */
    var _aliases = {};

    /** @type {Object} — User-defined aliases only (for persistence) */
    var _userAliases = {};

    // ── Persistence ─────────────────────────────────────────────

    function _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(_userAliases));
        } catch (e) {}
        _rebuild();
    }

    function _rebuild() {
        _aliases = {};
        // Start with defaults
        for (var key in DEFAULT_ALIASES) {
            if (DEFAULT_ALIASES.hasOwnProperty(key)) {
                _aliases[key] = DEFAULT_ALIASES[key];
            }
        }
        // Override with user aliases
        for (var uKey in _userAliases) {
            if (_userAliases.hasOwnProperty(uKey)) {
                _aliases[uKey] = _userAliases[uKey];
            }
        }
    }

    function load() {
        try {
            var data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                _userAliases = JSON.parse(data) || {};
            }
        } catch (e) {
            _userAliases = {};
        }
        _rebuild();
    }

    // ── Alias Operations ────────────────────────────────────────

    /**
     * Get the effect name for an alias.
     * @param {string} alias
     * @returns {string|null}
     */
    function resolve(alias) {
        var key = (alias || "").toLowerCase().trim();
        return _aliases[key] || null;
    }

    /**
     * Set a user alias.
     * @param {string} alias      — Short keyword
     * @param {string} effectName — Full effect name
     */
    function set(alias, effectName) {
        var key = alias.toLowerCase().trim();
        if (!key) return;
        _userAliases[key] = effectName;
        _save();
    }

    /**
     * Remove a user alias (reverts to default if one exists).
     */
    function remove(alias) {
        var key = alias.toLowerCase().trim();
        delete _userAliases[key];
        _save();
    }

    /**
     * Get all current aliases (merged defaults + user).
     */
    function getAll() {
        return JSON.parse(JSON.stringify(_aliases));
    }

    /**
     * Get only user-defined aliases.
     */
    function getUserAliases() {
        return JSON.parse(JSON.stringify(_userAliases));
    }

    /**
     * Get default aliases.
     */
    function getDefaults() {
        return JSON.parse(JSON.stringify(DEFAULT_ALIASES));
    }

    /**
     * Check if an alias is user-defined (vs built-in default).
     */
    function isUserDefined(alias) {
        var key = alias.toLowerCase().trim();
        return _userAliases.hasOwnProperty(key);
    }

    /**
     * Reset all user aliases (revert to defaults only).
     */
    function resetToDefaults() {
        _userAliases = {};
        _save();
    }

    /**
     * Export all user aliases as JSON string.
     */
    function exportData() {
        return JSON.stringify(_userAliases, null, 2);
    }

    /**
     * Import user aliases from JSON string.
     */
    function importData(jsonStr) {
        try {
            var parsed = JSON.parse(jsonStr);
            if (typeof parsed === "object" && !Array.isArray(parsed)) {
                _userAliases = parsed;
                _save();
                return true;
            }
        } catch (e) {}
        return false;
    }

    // ── Initialize ──────────────────────────────────────────────
    load();

    return {
        resolve: resolve,
        set: set,
        remove: remove,
        getAll: getAll,
        getUserAliases: getUserAliases,
        getDefaults: getDefaults,
        isUserDefined: isUserDefined,
        resetToDefaults: resetToDefaults,
        exportData: exportData,
        importData: importData,
        load: load
    };

})();
