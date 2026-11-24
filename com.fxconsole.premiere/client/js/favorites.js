/**
 * FX Console — Favorites Manager
 * ================================
 * Manages 9 favorite effect slots (keys 1–9).
 * Persists favorites in localStorage via CSInterface preferences.
 */

var FXFavorites = (function () {
    "use strict";

    var STORAGE_KEY = "fxconsole_favorites";
    var MAX_SLOTS = 9;

    /** @type {Array<Object|null>} — 9 slots (index 0 = slot 1, etc.) */
    var _slots = new Array(MAX_SLOTS);
    for (var i = 0; i < MAX_SLOTS; i++) _slots[i] = null;

    /** @type {function|null} — Callback when favorites change */
    var _onChange = null;

    // ── Persistence ─────────────────────────────────────────────

    function _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(_slots));
        } catch (e) {}
        if (typeof _onChange === "function") _onChange(_slots);
    }

    function load() {
        try {
            var data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                var parsed = JSON.parse(data);
                if (Array.isArray(parsed)) {
                    for (var i = 0; i < MAX_SLOTS; i++) {
                        _slots[i] = parsed[i] || null;
                    }
                }
            }
        } catch (e) {
            // Reset on corruption
            for (var j = 0; j < MAX_SLOTS; j++) _slots[j] = null;
        }
    }

    // ── Slot Management ─────────────────────────────────────────

    /**
     * Assign an effect to a favorite slot.
     * @param {number} slotNumber — 1 through 9
     * @param {Object} effect     — { name, type, category }
     */
    function setSlot(slotNumber, effect) {
        if (slotNumber < 1 || slotNumber > MAX_SLOTS) return;
        _slots[slotNumber - 1] = effect ? {
            name: effect.name,
            type: effect.type,
            category: effect.category || ""
        } : null;
        _save();
    }

    /**
     * Get the effect assigned to a slot.
     * @param {number} slotNumber — 1 through 9
     * @returns {Object|null}
     */
    function getSlot(slotNumber) {
        if (slotNumber < 1 || slotNumber > MAX_SLOTS) return null;
        return _slots[slotNumber - 1];
    }

    /**
     * Clear a specific slot.
     */
    function clearSlot(slotNumber) {
        setSlot(slotNumber, null);
    }

    /**
     * Clear all 9 slots.
     */
    function clearAll() {
        for (var i = 0; i < MAX_SLOTS; i++) _slots[i] = null;
        _save();
    }

    /**
     * Get all slots as an array.
     * @returns {Array<Object|null>}
     */
    function getAllSlots() {
        return _slots.slice();
    }

    /**
     * Check if an effect is already in a favorite slot.
     * @param {string} effectName
     * @returns {number} Slot number (1–9) or 0 if not found
     */
    function findSlot(effectName) {
        for (var i = 0; i < MAX_SLOTS; i++) {
            if (_slots[i] && _slots[i].name === effectName) {
                return i + 1;
            }
        }
        return 0;
    }

    /**
     * Find the first empty slot.
     * @returns {number} Slot number (1–9) or 0 if all full
     */
    function firstEmptySlot() {
        for (var i = 0; i < MAX_SLOTS; i++) {
            if (!_slots[i]) return i + 1;
        }
        return 0;
    }

    /**
     * Register a change callback.
     */
    function onChange(callback) {
        _onChange = callback;
    }

    /**
     * Export favorites data for backup.
     */
    function exportData() {
        return JSON.stringify(_slots, null, 2);
    }

    /**
     * Import favorites from backup data.
     */
    function importData(jsonStr) {
        try {
            var parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed)) {
                for (var i = 0; i < MAX_SLOTS; i++) {
                    _slots[i] = parsed[i] || null;
                }
                _save();
                return true;
            }
        } catch (e) {}
        return false;
    }

    // ── Initialize ──────────────────────────────────────────────
    load();

    return {
        setSlot: setSlot,
        getSlot: getSlot,
        clearSlot: clearSlot,
        clearAll: clearAll,
        getAllSlots: getAllSlots,
        findSlot: findSlot,
        firstEmptySlot: firstEmptySlot,
        onChange: onChange,
        load: load,
        exportData: exportData,
        importData: importData,
        MAX_SLOTS: MAX_SLOTS
    };

})();
