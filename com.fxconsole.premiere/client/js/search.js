/**
 * FX Console — Fuzzy Search Engine
 * =================================
 * High-performance fuzzy search optimized for effect names.
 * Supports weighted scoring, category boosting, and alias matching.
 */

var FXSearch = (function () {
    "use strict";

    var _items = [];        // Full effects database
    var _aliasMap = {};     // alias → canonical name
    var _recentMap = {};    // effectName → usage count (for ranking boost)

    // ── Initialization ──────────────────────────────────────────

    /**
     * Load effects database for searching.
     * @param {Array} items — Array of { name, type, category }
     */
    function setItems(items) {
        _items = items || [];
        // Pre-compute lowercase names for faster matching
        for (var i = 0; i < _items.length; i++) {
            _items[i]._lower = _items[i].name.toLowerCase();
            _items[i]._words = _items[i]._lower.split(/[\s\-_\/\\]+/);
        }
    }

    /**
     * Set alias map (short keyword → full effect name).
     * @param {Object} aliases — e.g. { "lum": "Lumetri Color", "cc": "Color Correction" }
     */
    function setAliases(aliases) {
        _aliasMap = {};
        if (aliases) {
            for (var key in aliases) {
                if (aliases.hasOwnProperty(key)) {
                    _aliasMap[key.toLowerCase()] = aliases[key];
                }
            }
        }
    }

    /**
     * Set recent usage data for ranking boost.
     * @param {Object} recents — { "Lumetri Color": 15, "Gaussian Blur": 8, ... }
     */
    function setRecents(recents) {
        _recentMap = recents || {};
    }

    // ── Core Search ─────────────────────────────────────────────

    /**
     * Search the effects database with fuzzy matching.
     * @param {string} query   — User's search query
     * @param {Object} options — { maxResults, typeFilter, categoryFilter }
     * @returns {Array} Sorted results: [{ item, score, matchType }, ...]
     */
    function search(query, options) {
        if (!query || query.trim() === "") {
            return _getTopRecents(options && options.maxResults || 20);
        }

        options = options || {};
        var maxResults = options.maxResults || 50;
        var typeFilter = options.typeFilter || null;    // e.g. "videoEffect"
        var categoryFilter = options.categoryFilter || null;

        var q = query.toLowerCase().trim();

        // 1. Check if query matches an alias
        if (_aliasMap[q]) {
            var aliasTarget = _aliasMap[q].toLowerCase();
            // Find the exact match for the alias target
            for (var a = 0; a < _items.length; a++) {
                if (_items[a]._lower === aliasTarget) {
                    return [{ item: _items[a], score: 1000, matchType: "alias" }];
                }
            }
        }

        // 2. Score every item
        var results = [];
        for (var i = 0; i < _items.length; i++) {
            var item = _items[i];

            // Apply filters
            if (typeFilter && item.type !== typeFilter) continue;
            if (categoryFilter && item.category !== categoryFilter) continue;

            var score = _scoreMatch(q, item);
            if (score > 0) {
                // Boost for recent usage
                var recentBoost = _recentMap[item.name] ? Math.min(_recentMap[item.name] * 2, 50) : 0;
                results.push({
                    item: item,
                    score: score + recentBoost,
                    matchType: score >= 100 ? "exact" : score >= 50 ? "startsWith" : "fuzzy"
                });
            }
        }

        // 3. Sort by score (descending), then alphabetically
        results.sort(function (a, b) {
            if (b.score !== a.score) return b.score - a.score;
            return a.item.name.localeCompare(b.item.name);
        });

        // 4. Limit results
        return results.slice(0, maxResults);
    }

    // ── Scoring Algorithm ───────────────────────────────────────

    /**
     * Compute a relevance score for query vs item.
     * @returns {number} 0 = no match, higher = better match
     */
    function _scoreMatch(query, item) {
        var name = item._lower;
        var score = 0;

        // Exact match
        if (name === query) return 200;

        // Starts with query
        if (name.indexOf(query) === 0) return 150;

        // Contains query as substring
        var idx = name.indexOf(query);
        if (idx > 0) {
            // Bonus if match is at a word boundary
            if (name[idx - 1] === " " || name[idx - 1] === "-" || name[idx - 1] === "_") {
                return 120;
            }
            return 80;
        }

        // Word-initial matching (e.g., "gb" matches "Gaussian Blur")
        var words = item._words;
        var qChars = query.split("");
        var wordIdx = 0;
        var charIdx = 0;
        var wordInitialMatch = true;

        for (var w = 0; w < words.length && charIdx < qChars.length; w++) {
            if (words[w].length > 0 && words[w][0] === qChars[charIdx]) {
                charIdx++;
            }
        }
        if (charIdx === qChars.length) {
            return 100; // All query chars matched word initials
        }

        // Fuzzy character-by-character matching
        var fuzzyScore = _fuzzyMatch(query, name);
        if (fuzzyScore > 0) {
            return fuzzyScore;
        }

        return 0;
    }

    /**
     * Fuzzy matching: characters of query appear in order within name.
     * Score is based on how close together the matched characters are.
     */
    function _fuzzyMatch(query, text) {
        var qLen = query.length;
        var tLen = text.length;

        if (qLen > tLen) return 0;

        var qIdx = 0;
        var lastMatchPos = -1;
        var totalGap = 0;
        var consecutiveBonus = 0;

        for (var tIdx = 0; tIdx < tLen && qIdx < qLen; tIdx++) {
            if (text[tIdx] === query[qIdx]) {
                if (lastMatchPos >= 0) {
                    var gap = tIdx - lastMatchPos - 1;
                    totalGap += gap;
                    if (gap === 0) consecutiveBonus += 10;
                }
                lastMatchPos = tIdx;
                qIdx++;
            }
        }

        // All query characters found in order
        if (qIdx === qLen) {
            var baseScore = 40;
            // Penalize large gaps
            var gapPenalty = Math.min(totalGap * 2, 30);
            // Bonus for consecutive matches
            var score = baseScore - gapPenalty + consecutiveBonus;
            // Bonus for matching more of the name
            var coverageBonus = Math.floor((qLen / tLen) * 20);
            return Math.max(score + coverageBonus, 1);
        }

        return 0; // Not all characters found
    }

    // ── Helpers ─────────────────────────────────────────────────

    /**
     * Return top recently-used effects (shown when query is empty).
     */
    function _getTopRecents(maxResults) {
        var entries = [];
        for (var name in _recentMap) {
            if (_recentMap.hasOwnProperty(name)) {
                // Find the item
                for (var i = 0; i < _items.length; i++) {
                    if (_items[i].name === name) {
                        entries.push({
                            item: _items[i],
                            score: _recentMap[name],
                            matchType: "recent"
                        });
                        break;
                    }
                }
            }
        }
        entries.sort(function (a, b) { return b.score - a.score; });
        return entries.slice(0, maxResults);
    }

    /**
     * Get all unique categories from loaded items.
     */
    function getCategories() {
        var cats = {};
        for (var i = 0; i < _items.length; i++) {
            cats[_items[i].category] = true;
        }
        return Object.keys(cats);
    }

    /**
     * Get all unique types from loaded items.
     */
    function getTypes() {
        var types = {};
        for (var i = 0; i < _items.length; i++) {
            types[_items[i].type] = true;
        }
        return Object.keys(types);
    }

    /**
     * Get total item count.
     */
    function getItemCount() {
        return _items.length;
    }

    // ── Public API ──────────────────────────────────────────────

    return {
        setItems: setItems,
        setAliases: setAliases,
        setRecents: setRecents,
        search: search,
        getCategories: getCategories,
        getTypes: getTypes,
        getItemCount: getItemCount
    };

})();
