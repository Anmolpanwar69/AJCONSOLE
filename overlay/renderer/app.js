/**
 * AJ Console Overlay — Renderer App
 * ====================================
 * Compact FX Console replica with instant focus, keyboard navigation,
 * dynamic resizing, and auto-dismiss on blur.
 */

(function () {
    "use strict";

    // ── State ───────────────────────────────────────────────────
    let allEffects = [];
    let searchResults = [];
    let selectedIndex = 0;

    const DEFAULT_TOP_EFFECTS = [
        "Fast Blur",
        "CC Radial Fast Blur",
        "Gaussian Blur",
        "Lumetri Color",
        "Crop"
    ];

    // ── DOM Elements ────────────────────────────────────────────
    const $overlay        = document.getElementById("overlay");
    const $searchInput    = document.getElementById("overlaySearchInput");
    const $categoryHeader = document.getElementById("categoryHeader");
    const $categoryTitle  = document.getElementById("categoryTitle");
    const $resultsList    = document.getElementById("resultsList");

    const $btnSnapshot    = document.getElementById("btnSnapshot");
    const $btnGallery     = document.getElementById("btnGallery");
    const $btnPresets     = document.getElementById("btnPresets");
    const $btnSettings    = document.getElementById("btnSettings");
    const $btnLogo        = document.getElementById("btnLogo");

    // ── Focus Helper ────────────────────────────────────────────

    function focusInput() {
        if ($searchInput) {
            $searchInput.focus();
            $searchInput.select();
        }
    }

    // ── Initialization ──────────────────────────────────────────

    async function init() {
        // Load cached effects
        try {
            allEffects = await window.fxConsole.getEffects();
        } catch (e) {
            allEffects = [];
        }

        if ((!allEffects || allEffects.length === 0) && typeof FX_DEFAULT_EFFECTS !== "undefined") {
            allEffects = FX_DEFAULT_EFFECTS.slice();
        }

        prepareItems();

        // Listen for main process show/hide events
        window.fxConsole.onShow((data) => {
            if (data && data.effects && data.effects.length > 0) {
                allEffects = data.effects;
                prepareItems();
            }

            // Reset input and populate list
            $searchInput.value = "";
            showDefaultList();

            // Multi-stage focus to guarantee the caret is active and blinking immediately
            focusInput();
            requestAnimationFrame(() => focusInput());
            setTimeout(focusInput, 20);
            setTimeout(focusInput, 60);
            setTimeout(focusInput, 150);
        });

        window.fxConsole.onHide(() => {
            $searchInput.value = "";
        });

        window.fxConsole.onEffectsUpdated((effects) => {
            if (effects && effects.length > 0) {
                allEffects = effects;
                prepareItems();
            }
        });

        // Window focus -> ensure input is focused
        window.addEventListener("focus", () => {
            focusInput();
        });

        bindEvents();
        showDefaultList();
        focusInput();
    }

    function prepareItems() {
        for (let i = 0; i < allEffects.length; i++) {
            allEffects[i]._lower = (allEffects[i].name || "").toLowerCase();
        }
    }

    function showDefaultList() {
        const top = [];
        for (const name of DEFAULT_TOP_EFFECTS) {
            const found = allEffects.find((e) => e._lower === name.toLowerCase());
            if (found) {
                top.push(found);
            } else {
                top.push({ name: name, type: "videoEffect", category: "Effects" });
            }
        }

        searchResults = top.map((item) => ({ item, score: 100 }));
        selectedIndex = 0;
        $categoryTitle.textContent = "Effects";
        renderResults();
    }

    // ── Search Algorithm ────────────────────────────────────────

    function performSearch(query) {
        if (!query || query.trim() === "") {
            showDefaultList();
            return;
        }

        const q = query.toLowerCase().trim();
        const scored = [];

        for (let i = 0; i < allEffects.length; i++) {
            const item = allEffects[i];
            const name = item._lower;
            let score = 0;

            if (name === q) {
                score = 250;
            } else if (name.startsWith(q)) {
                score = 180 - (name.length - q.length);
            } else if (name.includes(q)) {
                const idx = name.indexOf(q);
                score = (name[idx - 1] === " " || name[idx - 1] === "-") ? 130 : 90;
            } else {
                // Word initials match (e.g. "fb" -> "Fast Blur")
                const words = name.split(/[\s\-_]+/);
                let qi = 0;
                for (const word of words) {
                    if (qi < q.length && word.length > 0 && word[0] === q[qi]) {
                        qi++;
                    }
                }
                if (qi === q.length) {
                    score = 110;
                } else {
                    score = fuzzyScore(q, name);
                }
            }

            if (score > 0) {
                scored.push({ item, score });
            }
        }

        scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
        searchResults = scored.slice(0, 6); // Max 6 results for compact look
        selectedIndex = 0;

        // Update category header
        if (searchResults.length > 0) {
            const firstType = searchResults[0].item.type || "";
            if (firstType.includes("Transition")) {
                $categoryTitle.textContent = "Transitions";
            } else {
                $categoryTitle.textContent = "Effects";
            }
        } else {
            $categoryTitle.textContent = "Effects";
        }

        renderResults();
    }

    function fuzzyScore(query, text) {
        let qi = 0;
        let lastMatch = -1;
        let gap = 0;
        let consecutive = 0;

        for (let ti = 0; ti < text.length && qi < query.length; ti++) {
            if (text[ti] === query[qi]) {
                if (lastMatch >= 0) {
                    const g = ti - lastMatch - 1;
                    gap += g;
                    if (g === 0) consecutive += 10;
                }
                lastMatch = ti;
                qi++;
            }
        }

        if (qi < query.length) return 0;
        return Math.max(40 - gap * 2 + consecutive, 1);
    }

    // ── Rendering ───────────────────────────────────────────────

    function renderResults() {
        if (searchResults.length === 0) {
            $resultsList.innerHTML = `<div class="result-item" style="color: #666; font-style: italic;">No matching effects</div>`;
            syncWindowHeight(1);
            return;
        }

        const q = $searchInput.value.trim();
        let html = "";
        for (let i = 0; i < searchResults.length; i++) {
            const item = searchResults[i].item;
            const isSelected = i === selectedIndex;
            const highlightedName = highlightMatch(item.name, q);

            html += `<div class="result-item${isSelected ? " selected" : ""}" data-index="${i}">
                ${highlightedName}
            </div>`;
        }

        $resultsList.innerHTML = html;

        // Bind clicks
        const rows = $resultsList.querySelectorAll(".result-item");
        rows.forEach((el) => {
            el.addEventListener("click", () => {
                const idx = parseInt(el.dataset.index, 10);
                if (!isNaN(idx)) {
                    applyAtIndex(idx);
                }
            });
        });

        syncWindowHeight(searchResults.length);
    }

    function syncWindowHeight(itemCount) {
        // Height formula: 40px (search bar) + 22px (category header) + N * 30px (items)
        const totalHeight = 40 + 22 + (itemCount * 30);
        window.fxConsole.setHeight(totalHeight);
    }

    function updateSelection(newIndex) {
        if (searchResults.length === 0) return;
        if (newIndex < 0) newIndex = searchResults.length - 1;
        if (newIndex >= searchResults.length) newIndex = 0;

        const items = $resultsList.querySelectorAll(".result-item");
        if (items[selectedIndex]) items[selectedIndex].classList.remove("selected");
        selectedIndex = newIndex;
        if (items[selectedIndex]) {
            items[selectedIndex].classList.add("selected");
            items[selectedIndex].scrollIntoView({ block: "nearest" });
        }
    }

    // ── Apply Effect ────────────────────────────────────────────

    async function applyAtIndex(index) {
        if (index < 0 || index >= searchResults.length) return;
        const item = searchResults[index].item;
        // Instantly hide the overlay when user confirms selection
        window.fxConsole.hideOverlay();
        await executeApply(item);
    }

    async function executeApply(item) {
        // Ensure overlay is hidden immediately
        window.fxConsole.hideOverlay();

        try {
            const result = await window.fxConsole.applyEffect({
                name: item.name,
                type: item.type,
                matchName: item.matchName || ""
            });

            if (result && result.success) {
                const clipText = (result.clipNames && result.clipNames.length > 0)
                    ? result.clipNames.join(", ")
                    : "selected clip";
                showToast(`${item.name} applied to ${clipText}`);
            } else {
                const errMsg = (result && result.errors && result.errors.length > 0)
                    ? result.errors[0]
                    : (result && result.error ? result.error : "No clip selected");
                showToast(errMsg, true);
            }
        } catch (e) {
            showToast("Error: " + e.message, true);
        }
    }

    // ── Toast Feedback ──────────────────────────────────────────

    function showToast(message, isError) {
        const existing = document.querySelector(".overlay-toast");
        if (existing) existing.remove();

        const el = document.createElement("div");
        el.className = "overlay-toast" + (isError ? " error" : "");
        el.textContent = message;
        document.body.appendChild(el);

        setTimeout(() => {
            if (el.parentNode) el.remove();
        }, 2200);
    }

    // ── Event Binding ───────────────────────────────────────────

    function bindEvents() {
        // Prevent clicking inside overlay from stealing focus from search input
        $overlay.addEventListener("mousedown", (e) => {
            if (!e.target.closest(".icon-btn") && !e.target.closest(".result-item") && e.target !== $searchInput) {
                e.preventDefault();
                focusInput();
            }
        });

        // Search typing
        $searchInput.addEventListener("input", () => {
            performSearch($searchInput.value);
        });

        // Keydown handlers
        document.addEventListener("keydown", (e) => {
            // Forward any typed character to search input if not already focused
            if (document.activeElement !== $searchInput) {
                if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                    $searchInput.focus();
                    // Let event proceed into input
                } else if (e.key === "Backspace" || e.key === "Delete") {
                    $searchInput.focus();
                }
            }

            if (e.key === "Escape") {
                e.preventDefault();
                window.fxConsole.hideOverlay();
                return;
            }

            if (e.key === "ArrowDown") {
                e.preventDefault();
                updateSelection(selectedIndex + 1);
                return;
            }

            if (e.key === "ArrowUp") {
                e.preventDefault();
                updateSelection(selectedIndex - 1);
                return;
            }

            if (e.key === "Enter") {
                e.preventDefault();
                window.fxConsole.hideOverlay();
                applyAtIndex(selectedIndex);
                return;
            }

            if (e.key === "F5") {
                e.preventDefault();
                triggerSnapshot();
                return;
            }
        });

        // Snapshot button
        $btnSnapshot.addEventListener("click", () => {
            triggerSnapshot();
        });

        // Gallery button
        $btnGallery.addEventListener("click", () => {
            showToast("Gallery opened in AJ Console");
            setTimeout(() => window.fxConsole.hideOverlay(), 500);
        });

        // Presets button
        $btnPresets.addEventListener("click", () => {
            if (searchResults.length > 0) {
                const item = searchResults[selectedIndex].item;
                showToast(`Favorite preset: ${item.name}`);
            } else {
                showToast("Presets ready");
            }
        });

        // Settings button
        $btnSettings.addEventListener("click", () => {
            showToast("AJ Console v1.0.0 (Premiere Pro)");
        });

        // Logo button
        $btnLogo.addEventListener("click", () => {
            showToast("AJ Console — Active");
        });
    }

    async function triggerSnapshot() {
        try {
            const res = await window.fxConsole.captureFrame();
            if (res && res.success) {
                showToast("Snapshot captured!");
            } else {
                showToast("Snapshot failed", true);
            }
        } catch (e) {
            showToast("Snapshot error: " + e.message, true);
        }
    }

    // ── Utilities ───────────────────────────────────────────────

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.appendChild(document.createTextNode(str || ""));
        return div.innerHTML;
    }

    function highlightMatch(text, query) {
        if (!query) return escapeHtml(text);
        const lower = text.toLowerCase();
        const qLower = query.toLowerCase();
        const idx = lower.indexOf(qLower);
        if (idx >= 0) {
            return escapeHtml(text.substring(0, idx)) +
                   `<span class="match">${escapeHtml(text.substring(idx, idx + query.length))}</span>` +
                   escapeHtml(text.substring(idx + query.length));
        }
        return escapeHtml(text);
    }

    // ── Start ───────────────────────────────────────────────────
    init();

})();
