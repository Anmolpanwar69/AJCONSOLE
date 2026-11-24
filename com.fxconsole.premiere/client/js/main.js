/**
 * FX Console for Premiere Pro — Main Controller
 * ===============================================
 * Orchestrates UI, search, favorites, gallery, and aliases.
 * Bridges the CEP panel with the Premiere Pro ExtendScript backend.
 */

(function () {
    "use strict";

    // ── Globals ──────────────────────────────────────────────────
    var cs = new CSInterface();
    var allEffects = [];
    var currentResults = [];
    var selectedIndex = 0;
    var currentMode = "search";        // "search" | "gallery" | "settings"
    var currentFilter = "all";         // "all" | "videoEffect" | etc.
    var contextTarget = null;          // Effect item under context menu
    var wsServer = null;               // WebSocket server for overlay communication
    var recentUsage = {};              // effect name → use count

    var RECENTS_KEY = "fxconsole_recents";
    var SCREENSHOT_DIR_KEY = "fxconsole_screenshot_dir";

    // ── DOM References ──────────────────────────────────────────
    var $searchInput    = document.getElementById("searchInput");
    var $searchClear    = document.getElementById("searchClear");
    var $resultsContainer = document.getElementById("resultsContainer");
    var $emptyState     = document.getElementById("emptyState");
    var $favoritesBar   = document.getElementById("favoritesBar");
    var $filterBar      = document.getElementById("filterBar");
    var $statusDot      = document.getElementById("statusDot");
    var $statusText     = document.getElementById("statusText");
    var $resultCount    = document.getElementById("resultCount");
    var $selectionInfo  = document.getElementById("selectionInfo");
    var $toastContainer = document.getElementById("toastContainer");
    var $contextMenu    = document.getElementById("contextMenu");

    // Views
    var $searchView     = document.getElementById("searchView");
    var $galleryView    = document.getElementById("galleryView");
    var $settingsView   = document.getElementById("settingsView");
    var $comparisonView = document.getElementById("comparisonView");

    // Gallery
    var $captureBtn     = document.getElementById("captureBtn");
    var $captureClipboardBtn = document.getElementById("captureClipboardBtn");
    var $clearGalleryBtn = document.getElementById("clearGalleryBtn");
    var $galleryGrid    = document.getElementById("galleryGrid");

    // Settings
    var $screenshotDir  = document.getElementById("screenshotDir");
    var $refreshEffectsBtn = document.getElementById("refreshEffectsBtn");
    var $hostInfoLabel  = document.getElementById("hostInfoLabel");
    var $effectsCountLabel = document.getElementById("effectsCountLabel");

    // Alias editor
    var $newAliasKey    = document.getElementById("newAliasKey");
    var $newAliasValue  = document.getElementById("newAliasValue");
    var $addAliasBtn    = document.getElementById("addAliasBtn");
    var $aliasTableBody = document.getElementById("aliasTableBody");

    // Diagnostics Drawer
    var $errorBadgeBtn      = document.getElementById("errorBadgeBtn");
    var $errorBadgeCount    = document.getElementById("errorBadgeCount");
    var $diagnosticDrawer   = document.getElementById("diagnosticDrawer");
    var $drawerCloseBtn     = document.getElementById("drawerCloseBtn");
    var $runDiagTestBtn     = document.getElementById("runDiagTestBtn");
    var $copyDiagBtn        = document.getElementById("copyDiagBtn");
    var $clearDiagBtn       = document.getElementById("clearDiagBtn");
    var $diagStatusBox      = document.getElementById("diagStatusBox");
    var $diagLogPre         = document.getElementById("diagLogPre");

    var diagnosticHistory = [];
    var errorCount = 0;

    // ── Initialization ──────────────────────────────────────────

    function init() {
        // Explicitly evaluate host/index.jsx to ensure ExtendScript functions and JSON polyfill are loaded
        try {
            var extRoot = cs.getSystemPath(SystemPath.EXTENSION);
            var jsxPath = (extRoot + "/host/index.jsx").replace(/\\/g, "/");
            cs.evalScript('$.evalFile("' + jsxPath + '")', function (res) {
                console.log("ExtendScript host index.jsx loaded:", res);
            });
        } catch (e) {
            console.warn("Could not evaluate index.jsx via evalFile:", e.message);
        }

        // Load persisted data
        loadRecents();
        loadScreenshotDir();

        // Seed immediately with default catalog so effects are instantly searchable
        if (typeof FX_DEFAULT_EFFECTS !== "undefined" && Array.isArray(FX_DEFAULT_EFFECTS)) {
            allEffects = FX_DEFAULT_EFFECTS.slice();
            FXSearch.setItems(allEffects);
            setStatus("ok", "Ready — " + allEffects.length + " effects loaded");
            if ($effectsCountLabel) {
                $effectsCountLabel.textContent = "Effects: " + allEffects.length + " loaded";
            }
        } else {
            setStatus("loading", "Loading effects...");
        }

        // Initialize modules
        FXSearch.setAliases(FXAliases.getAll());
        FXSearch.setRecents(recentUsage);

        // Build favorite slots UI
        renderFavoriteSlots();
        FXFavorites.onChange(renderFavoriteSlots);

        // Fetch dynamic effects from Premiere Pro
        loadEffects();

        // Fetch host info
        loadHostInfo();

        // Bind events
        bindEvents();

        // Start IPC server for Electron overlay communication
        startIPCServer();

        // Ensure Electron overlay is running
        ensureOverlayRunning();

        // Poll for selection changes
        setInterval(pollSelection, 2000);
    }

    function ensureOverlayRunning() {
        try {
            var cp = require("child_process");
            var path = require("path");
            var fs = require("fs");
            var http = require("http");

            var extPath = cs.getSystemPath(SystemPath.EXTENSION);
            var realExt = extPath;
            try { realExt = fs.realpathSync(extPath); } catch (e) {}

            var candidateDirs = [
                path.resolve(realExt, "..", "overlay"),
                path.resolve(extPath, "..", "overlay"),
                path.join(process.env.APPDATA || "", "Adobe", "CEP", "extensions", "overlay")
            ];

            var overlayDir = "";
            for (var d = 0; d < candidateDirs.length; d++) {
                if (candidateDirs[d] && fs.existsSync(candidateDirs[d])) {
                    overlayDir = candidateDirs[d];
                    break;
                }
            }

            // 1. Ensure Low-Level Keyboard Hook is running
            if (overlayDir) {
                var hookExe = path.join(overlayDir, "hook", "fxconsole-hook.exe");
                if (fs.existsSync(hookExe)) {
                    var hookChild = cp.spawn(hookExe, [], {
                        cwd: path.dirname(hookExe),
                        detached: true,
                        stdio: "ignore",
                        windowsHide: true
                    });
                    hookChild.unref();
                    console.log("Launched AJ Console native hook (PID: " + hookChild.pid + ")");
                }
            }

            // 2. Ensure Electron Overlay is running
            var req = http.get("http://127.0.0.1:39473/status", function (res) {
                console.log("Overlay service verified active.");
            });
            req.on("error", function () {
                if (!overlayDir) return;
                var electronExe = path.join(overlayDir, "node_modules", "electron", "dist", "electron.exe");
                var mainJs = path.join(overlayDir, "main.js");

                if (fs.existsSync(electronExe)) {
                    var child = cp.spawn(electronExe, [mainJs], {
                        cwd: overlayDir,
                        detached: true,
                        stdio: "ignore"
                    });
                    child.unref();
                    console.log("Auto-started overlay daemon from CEP panel (PID: " + child.pid + ")");
                }
            });
        } catch (e) {
            console.log("ensureOverlayRunning notice:", e.message);
        }
    }

    // ── Effects Loading ─────────────────────────────────────────

    function loadEffects() {
        cs.evalScript("getAllEffects()", function (resultStr) {
            if (!resultStr || resultStr === "EvalScript error.") {
                if (allEffects.length > 0) {
                    setStatus("ok", "Ready — " + allEffects.length + " effects loaded");
                }
                return;
            }
            try {
                var parsed = JSON.parse(resultStr);
                if (parsed && Array.isArray(parsed) && parsed.length > 0) {
                    allEffects = parsed;
                    FXSearch.setItems(allEffects);
                    setStatus("ok", "Ready — " + allEffects.length + " effects loaded");
                    if ($effectsCountLabel) {
                        $effectsCountLabel.textContent = "Effects: " + allEffects.length + " loaded";
                    }
                } else if (allEffects.length > 0) {
                    setStatus("ok", "Ready — " + allEffects.length + " effects loaded");
                }
                // Refresh search with current input
                performSearch($searchInput.value.trim());
            } catch (e) {
                if (allEffects.length > 0) {
                    setStatus("ok", "Ready — " + allEffects.length + " effects loaded");
                } else {
                    setStatus("error", "Error loading effects");
                }
            }
        });
    }

    function loadHostInfo() {
        cs.evalScript("getHostInfo()", function (resultStr) {
            try {
                var info = JSON.parse(resultStr);
                if ($hostInfoLabel) {
                    $hostInfoLabel.textContent = info.appName + " v" + info.appVersion;
                }
            } catch (e) {}
        });
    }

    // ── Search ──────────────────────────────────────────────────

    function performSearch(query) {
        var options = { maxResults: 50 };
        if (currentFilter !== "all") {
            options.typeFilter = currentFilter;
        }

        currentResults = FXSearch.search(query, options);
        selectedIndex = 0;
        renderResults(query);
    }

    function renderResults(query) {
        // Clear previous results
        $resultsContainer.innerHTML = "";

        if (currentResults.length === 0) {
            if (query && query.length > 0) {
                $resultsContainer.innerHTML =
                    '<div class="empty-state">' +
                    '<div class="empty-icon">🔍</div>' +
                    '<div class="empty-title">No results for "' + escapeHtml(query) + '"</div>' +
                    '<div class="empty-hint">Try different keywords or check the filter</div>' +
                    '</div>';
            } else {
                $resultsContainer.innerHTML =
                    '<div class="empty-state">' +
                    '<div class="empty-icon">⚡</div>' +
                    '<div class="empty-title">FX Console Ready</div>' +
                    '<div class="empty-hint">Start typing to search effects, or press <kbd>1</kbd>–<kbd>9</kbd> for favorites</div>' +
                    '</div>';
            }
            $resultCount.textContent = "";
            return;
        }

        $resultCount.textContent = currentResults.length + " results";

        for (var i = 0; i < currentResults.length; i++) {
            var entry = currentResults[i];
            var item = entry.item;
            var el = document.createElement("div");
            el.className = "result-item" + (i === selectedIndex ? " selected" : "");
            el.dataset.index = i;

            // Type icon
            var iconClass = item.type.replace(/([A-Z])/g, "-$1").toLowerCase();
            var iconText = getTypeAbbr(item.type);

            // Highlight matched text
            var displayName = query ? highlightMatch(item.name, query) : escapeHtml(item.name);

            // Badge
            var badge = "";
            if (entry.matchType === "alias") {
                badge = '<span class="result-badge alias">ALIAS</span>';
            } else if (entry.matchType === "exact") {
                badge = '<span class="result-badge exact">EXACT</span>';
            } else if (entry.matchType === "recent") {
                badge = '<span class="result-badge recent">RECENT</span>';
            }

            // Favorite indicator
            var favSlot = FXFavorites.findSlot(item.name);
            var favHint = favSlot ? ' <span style="color:var(--warning);font-size:10px">⭐' + favSlot + '</span>' : "";

            el.innerHTML =
                '<div class="result-icon ' + iconClass + '">' + iconText + '</div>' +
                '<div class="result-info">' +
                '  <div class="result-name">' + displayName + favHint + '</div>' +
                '  <div class="result-category">' + escapeHtml(item.category) + '</div>' +
                '</div>' +
                badge;

            el.addEventListener("click", (function (idx) {
                return function () { applyResultAtIndex(idx); };
            })(i));

            el.addEventListener("contextmenu", (function (idx, itemRef) {
                return function (e) {
                    e.preventDefault();
                    contextTarget = itemRef;
                    showContextMenu(e.clientX, e.clientY);
                };
            })(i, item));

            $resultsContainer.appendChild(el);
        }

        // Scroll selected into view
        scrollToSelected();
    }

    function highlightMatch(text, query) {
        var lowerText = text.toLowerCase();
        var lowerQuery = query.toLowerCase();
        var idx = lowerText.indexOf(lowerQuery);
        if (idx >= 0) {
            return escapeHtml(text.substring(0, idx)) +
                   '<span class="highlight">' + escapeHtml(text.substring(idx, idx + query.length)) + '</span>' +
                   escapeHtml(text.substring(idx + query.length));
        }
        return escapeHtml(text);
    }

    function scrollToSelected() {
        var items = $resultsContainer.querySelectorAll(".result-item");
        if (items[selectedIndex]) {
            items[selectedIndex].scrollIntoView({ block: "nearest" });
        }
    }

    function updateSelection(newIndex) {
        if (newIndex < 0) newIndex = currentResults.length - 1;
        if (newIndex >= currentResults.length) newIndex = 0;

        var items = $resultsContainer.querySelectorAll(".result-item");
        if (items[selectedIndex]) items[selectedIndex].classList.remove("selected");
        selectedIndex = newIndex;
        if (items[selectedIndex]) {
            items[selectedIndex].classList.add("selected");
            items[selectedIndex].scrollIntoView({ block: "nearest" });
        }
    }

    // ── Apply Effect ────────────────────────────────────────────

    function applyResultAtIndex(index) {
        if (index < 0 || index >= currentResults.length) return;
        var item = currentResults[index].item;
        applyEffect(item);
    }

    function applyEffect(item) {
        setStatus("loading", "Applying " + item.name + "...");

        var script = 'applyEffectToSelection("' +
                     escapeJsx(item.name) + '", "' +
                     escapeJsx(item.type) + '", "' +
                     escapeJsx(item.matchName || "") + '")';

        cs.evalScript(script, function (resultStr) {
            if (!resultStr || resultStr === "EvalScript error.") {
                cs.evalScript("$.error + ' (line ' + $.line + ')'", function (errDetails) {
                    var msg = "ExtendScript Host Error: " + (errDetails || "Evaluation failed. Check Diagnostics.");
                    toast(msg, "error");
                    setStatus("error", "Host script error");
                    setErrorBadge(msg);
                    updateDiagnosticLogs([msg, "Script attempted: " + script], "error", [msg]);
                });
                return;
            }

            try {
                var result = JSON.parse(resultStr);

                // Update Diagnostic Drawer with full logs
                if (result.logs && Array.isArray(result.logs)) {
                    updateDiagnosticLogs(result.logs, result.success ? "success" : "error", result.errors);
                }

                if (result.success) {
                    var clipText = (result.clipNames && result.clipNames.length > 0)
                        ? result.clipNames.join(", ")
                        : "selected clip";
                    toast(item.name + " applied to " + clipText, "success");
                    setStatus("ok", item.name + " applied to " + clipText);
                    trackUsage(item.name);
                    clearErrorBadge();
                } else {
                    var errMsg = (result.errors && result.errors.length > 0) ? result.errors[0] : "Could not apply effect";
                    toast("Failed: " + errMsg, "error");
                    setStatus("error", errMsg);
                    setErrorBadge(errMsg);
                }
            } catch (e) {
                var parseErr = "ExtendScript Parse Error: " + e.message + "\nOutput was: " + resultStr;
                toast("Error: " + e.message, "error");
                setStatus("error", "Parse error");
                setErrorBadge(parseErr);
                updateDiagnosticLogs([parseErr], "error", [parseErr]);
            }
        });
    }

    function trackUsage(effectName) {
        recentUsage[effectName] = (recentUsage[effectName] || 0) + 1;
        FXSearch.setRecents(recentUsage);
        saveRecents();
    }

    // ── Favorites ───────────────────────────────────────────────

    function renderFavoriteSlots() {
        $favoritesBar.innerHTML = "";
        for (var i = 1; i <= FXFavorites.MAX_SLOTS; i++) {
            var slot = FXFavorites.getSlot(i);
            var el = document.createElement("button");
            el.className = "fav-slot" + (slot ? " filled" : "");
            el.title = slot ? slot.name + " (Press " + i + ")" : "Empty slot " + i + " (Right-click effect to assign)";

            el.innerHTML = '<span class="slot-number">' + i + '</span>' +
                           (slot ? escapeHtml(slot.name) : "—");

            el.addEventListener("click", (function (slotNum) {
                return function () { triggerFavorite(slotNum); };
            })(i));

            el.addEventListener("contextmenu", (function (slotNum) {
                return function (e) {
                    e.preventDefault();
                    if (FXFavorites.getSlot(slotNum)) {
                        FXFavorites.clearSlot(slotNum);
                        toast("Cleared favorite slot " + slotNum, "success");
                    }
                };
            })(i));

            $favoritesBar.appendChild(el);
        }
    }

    function triggerFavorite(slotNumber) {
        var slot = FXFavorites.getSlot(slotNumber);
        if (slot) {
            applyEffect(slot);
        } else {
            toast("Slot " + slotNumber + " is empty — right-click an effect to assign it", "error");
        }
    }

    function assignToFavorite(item) {
        var empty = FXFavorites.firstEmptySlot();
        if (empty) {
            FXFavorites.setSlot(empty, item);
            toast("Assigned " + item.name + " to slot " + empty, "success");
        } else {
            // All slots full — prompt user (simple: replace slot 9)
            toast("All slots full! Clear a slot first (right-click)", "error");
        }
    }

    // ── Gallery ─────────────────────────────────────────────────

    function renderGallery() {
        var snapshots = FXGallery.getAll();
        $galleryGrid.innerHTML = "";

        if (snapshots.length === 0) {
            $galleryGrid.innerHTML =
                '<div class="empty-state" style="grid-column: 1 / -1">' +
                '<div class="empty-icon">📷</div>' +
                '<div class="empty-title">No Snapshots Yet</div>' +
                '<div class="empty-hint">Press <kbd>F5</kbd> or click Capture Frame</div>' +
                '</div>';
            return;
        }

        for (var i = 0; i < snapshots.length; i++) {
            var snap = snapshots[i];
            var el = document.createElement("div");
            el.className = "gallery-item" + (snap.pinned ? " pinned" : "");
            el.dataset.id = snap.id;

            var label = snap.label || formatTimestamp(snap.timestamp);

            el.innerHTML =
                '<img src="file:///' + escapeHtml(snap.path.replace(/\\/g, "/")) + '" alt="Snapshot" loading="lazy">' +
                '<div class="gallery-label">' + escapeHtml(label) + '</div>' +
                '<div class="gallery-pin">📌</div>' +
                '<div class="gallery-actions">' +
                '  <button class="gallery-action-btn" data-action="copy" title="Copy to Clipboard">📋</button>' +
                '  <button class="gallery-action-btn" data-action="pin" title="Pin">📌</button>' +
                '  <button class="gallery-action-btn" data-action="delete" title="Delete">🗑️</button>' +
                '</div>';

            // Event delegation for action buttons
            el.addEventListener("click", (function (snapshot) {
                return function (e) {
                    var actionBtn = e.target.closest(".gallery-action-btn");
                    if (actionBtn) {
                        var action = actionBtn.dataset.action;
                        if (action === "copy") {
                            FXGallery.copyToClipboard(snapshot.path, function (r) {
                                toast(r.success ? "Copied to clipboard!" : "Copy failed: " + r.error,
                                      r.success ? "success" : "error");
                            });
                        } else if (action === "pin") {
                            FXGallery.togglePin(snapshot.id);
                            renderGallery();
                        } else if (action === "delete") {
                            FXGallery.remove(snapshot.id);
                            renderGallery();
                        }
                    }
                };
            })(snap));

            $galleryGrid.appendChild(el);
        }
    }

    function captureScreenshot(copyToClipboard) {
        var dir = FXGallery.getOutputDir();
        if (!dir) {
            toast("Set a screenshot directory in Settings first", "error");
            switchMode("settings");
            return;
        }

        setStatus("loading", "Capturing frame...");

        FXGallery.captureFrame(cs, function (result) {
            if (result.success) {
                toast("Frame captured!", "success");
                setStatus("ok", "Frame saved");
                clearErrorBadge();
                renderGallery();

                if (copyToClipboard && result.snapshot) {
                    FXGallery.copyToClipboard(result.snapshot.path, function (r) {
                        if (r.success) toast("Copied to clipboard!", "success");
                    });
                }
            } else {
                var cErr = result.error || "Capture failed";
                toast("Capture failed: " + cErr, "error");
                setStatus("error", "Capture failed");
                setErrorBadge("Capture Frame Failed: " + cErr);
                updateDiagnosticLogs(["Capture Screenshot Error:", cErr], "error", [cErr]);
            }
        });
    }

    // ── Mode Switching ──────────────────────────────────────────

    function switchMode(mode) {
        currentMode = mode;

        // Update tab styling
        var tabs = document.querySelectorAll(".mode-tab");
        for (var t = 0; t < tabs.length; t++) {
            tabs[t].classList.toggle("active", tabs[t].dataset.mode === mode);
        }

        // Show/hide views
        $searchView.classList.toggle("active", mode === "search");
        $galleryView.classList.toggle("active", mode === "gallery");
        $settingsView.classList.toggle("active", mode === "settings");
        $comparisonView.classList.toggle("active", false);

        // Focus search input in search mode
        if (mode === "search") {
            setTimeout(function () { $searchInput.focus(); }, 50);
        }

        // Refresh gallery when switching to it
        if (mode === "gallery") {
            renderGallery();
        }

        // Refresh alias table when switching to settings
        if (mode === "settings") {
            renderAliasTable();
            renderFavoritesEditor();
        }
    }

    // ── Alias Table ─────────────────────────────────────────────

    function renderAliasTable() {
        $aliasTableBody.innerHTML = "";
        var all = FXAliases.getAll();
        var keys = Object.keys(all).sort();

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var isUser = FXAliases.isUserDefined(key);
            var tr = document.createElement("tr");
            tr.innerHTML =
                '<td class="alias-key">' + escapeHtml(key) + '</td>' +
                '<td class="alias-value">' + escapeHtml(all[key]) + '</td>' +
                '<td class="alias-source">' + (isUser ? "User" : "Default") + '</td>' +
                '<td>' + (isUser ? '<button class="alias-delete-btn" data-key="' + escapeHtml(key) + '">✕</button>' : '') + '</td>';
            $aliasTableBody.appendChild(tr);
        }

        // Bind delete buttons
        var deleteBtns = $aliasTableBody.querySelectorAll(".alias-delete-btn");
        for (var d = 0; d < deleteBtns.length; d++) {
            deleteBtns[d].addEventListener("click", function () {
                FXAliases.remove(this.dataset.key);
                FXSearch.setAliases(FXAliases.getAll());
                renderAliasTable();
                toast("Alias removed", "success");
            });
        }
    }

    function renderFavoritesEditor() {
        var container = document.getElementById("favoritesEditor");
        if (!container) return;
        container.innerHTML = "";

        for (var i = 1; i <= FXFavorites.MAX_SLOTS; i++) {
            var slot = FXFavorites.getSlot(i);
            var row = document.createElement("div");
            row.className = "settings-row";
            row.innerHTML =
                '<label>Slot ' + i + ': ' + (slot ? escapeHtml(slot.name) : '<em style="color:var(--text-muted)">Empty</em>') + '</label>' +
                (slot ? '<button class="gallery-btn" data-slot="' + i + '" style="font-size:11px">Clear</button>' : '');
            container.appendChild(row);
        }

        // Bind clear buttons
        var clearBtns = container.querySelectorAll("button[data-slot]");
        for (var c = 0; c < clearBtns.length; c++) {
            clearBtns[c].addEventListener("click", function () {
                FXFavorites.clearSlot(parseInt(this.dataset.slot));
                renderFavoritesEditor();
                toast("Slot " + this.dataset.slot + " cleared", "success");
            });
        }
    }

    // ── Context Menu ────────────────────────────────────────────

    function showContextMenu(x, y) {
        $contextMenu.style.left = x + "px";
        $contextMenu.style.top = y + "px";
        $contextMenu.classList.add("visible");
    }

    function hideContextMenu() {
        $contextMenu.classList.remove("visible");
        contextTarget = null;
    }

    // ── Status & Toasts ─────────────────────────────────────────

    function setStatus(type, text) {
        $statusDot.className = "status-indicator" + (type === "error" ? " error" : type === "loading" ? " loading" : "");
        $statusText.textContent = text;
    }

    function toast(message, type) {
        var el = document.createElement("div");
        el.className = "toast " + (type || "");
        el.textContent = message;
        $toastContainer.appendChild(el);
        setTimeout(function () {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 3000);
    }

    // ── Selection Polling ───────────────────────────────────────

    function pollSelection() {
        cs.evalScript("getSelectedClipsInfo()", function (resultStr) {
            try {
                var result = JSON.parse(resultStr);
                if (result.clips && result.clips.length > 0) {
                    $selectionInfo.textContent = result.clips.length + " clip" +
                        (result.clips.length > 1 ? "s" : "") + " selected";
                } else {
                    $selectionInfo.textContent = "No selection";
                }
            } catch (e) {
                $selectionInfo.textContent = "No selection";
            }
        });
    }

    // ── Persistence ─────────────────────────────────────────────

    function loadRecents() {
        try {
            var data = localStorage.getItem(RECENTS_KEY);
            if (data) recentUsage = JSON.parse(data);
        } catch (e) {}
    }

    function saveRecents() {
        try {
            localStorage.setItem(RECENTS_KEY, JSON.stringify(recentUsage));
        } catch (e) {}
    }

    function loadScreenshotDir() {
        try {
            var dir = localStorage.getItem(SCREENSHOT_DIR_KEY);
            if (dir && dir.trim().length > 0) {
                FXGallery.setOutputDir(dir.trim().replace(/\\/g, "/"));
                if ($screenshotDir) $screenshotDir.value = dir;
            } else {
                var docPath = cs.getSystemPath(SystemPath.MY_DOCUMENTS) || "";
                docPath = docPath.replace(/^file:\/\/\/?/, "").replace(/\\/g, "/");
                if (!docPath) {
                    docPath = "C:/FXConsole_Screenshots";
                } else {
                    docPath = docPath + "/FXConsole_Screenshots";
                }
                FXGallery.setOutputDir(docPath);
                if ($screenshotDir) $screenshotDir.value = docPath;
                localStorage.setItem(SCREENSHOT_DIR_KEY, docPath);
            }
        } catch (e) {}
    }

    // ── IPC Server (for Electron Overlay) ───────────────────────

    function startIPCServer() {
        try {
            var http = require("http");
            wsServer = http.createServer(function (req, res) {
                // CORS headers
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
                res.setHeader("Access-Control-Allow-Headers", "Content-Type");
                res.setHeader("Content-Type", "application/json");

                if (req.method === "OPTIONS") {
                    res.writeHead(200);
                    res.end();
                    return;
                }

                if (req.method === "GET" && req.url === "/effects") {
                    res.writeHead(200);
                    res.end(JSON.stringify(allEffects));
                    return;
                }

                if (req.method === "GET" && req.url === "/favorites") {
                    res.writeHead(200);
                    res.end(JSON.stringify(FXFavorites.getAllSlots()));
                    return;
                }

                if (req.method === "GET" && req.url === "/status") {
                    res.writeHead(200);
                    res.end(JSON.stringify({ ready: true, effectCount: allEffects.length }));
                    return;
                }

                if (req.method === "POST" && req.url === "/focus-search") {
                    // Do not focus docked panel when floating overlay is the primary shortcut HUD
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true }));
                    return;
                }

                if (req.method === "POST" && req.url === "/eval") {
                    var evalBody = "";
                    req.on("data", function (chunk) { evalBody += chunk; });
                    req.on("end", function () {
                        cs.evalScript(evalBody, function (evalRes) {
                            res.writeHead(200);
                            res.end(JSON.stringify({ result: evalRes }));
                        });
                    });
                    return;
                }

                if (req.method === "POST" && req.url === "/apply") {
                    var body = "";
                    req.on("data", function (chunk) { body += chunk; });
                    req.on("end", function () {
                        try {
                            var data = JSON.parse(body);
                            if (data.name && data.type) {
                                var script = 'applyEffectToSelection("' +
                                             escapeJsx(data.name) + '", "' +
                                             escapeJsx(data.type) + '", "' +
                                             escapeJsx(data.matchName || "") + '")';
                                cs.evalScript(script, function (resultStr) {
                                    try {
                                        var resObj = JSON.parse(resultStr);
                                        if (resObj.success) {
                                            var clipText = (resObj.clipNames && resObj.clipNames.length > 0)
                                                ? resObj.clipNames.join(", ")
                                                : "selected clip";
                                            toast(data.name + " applied to " + clipText, "success");
                                            trackUsage(data.name);
                                        }
                                        res.writeHead(200);
                                        res.end(JSON.stringify(resObj));
                                    } catch (e) {
                                        res.writeHead(200);
                                        res.end(JSON.stringify({ success: true }));
                                    }
                                });
                            } else {
                                res.writeHead(400);
                                res.end(JSON.stringify({ error: "Missing name or type" }));
                            }
                        } catch (e) {
                            res.writeHead(400);
                            res.end(JSON.stringify({ error: e.message }));
                        }
                    });
                    return;
                }

                if (req.method === "POST" && req.url === "/capture") {
                    captureScreenshot(false);
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true }));
                    return;
                }

                if (req.method === "POST" && req.url === "/favorite") {
                    var favBody = "";
                    req.on("data", function (chunk) { favBody += chunk; });
                    req.on("end", function () {
                        try {
                            var data = JSON.parse(favBody);
                            var slot = FXFavorites.getSlot(data.slot);
                            if (slot) {
                                applyEffect(slot);
                                res.writeHead(200);
                                res.end(JSON.stringify({ success: true, applied: slot.name }));
                            } else {
                                res.writeHead(404);
                                res.end(JSON.stringify({ error: "Empty slot" }));
                            }
                        } catch (e) {
                            res.writeHead(400);
                            res.end(JSON.stringify({ error: e.message }));
                        }
                    });
                    return;
                }

                res.writeHead(404);
                res.end(JSON.stringify({ error: "Not found" }));
            });

            wsServer.listen(39471, "127.0.0.1", function () {
                console.log("FX Console IPC server on port 39471");
            });

            wsServer.on("error", function (err) {
                console.log("IPC server error:", err.message);
                // Port might be in use — try next port
                try {
                    wsServer.listen(39472, "127.0.0.1");
                } catch (e) {}
            });

        } catch (e) {
            console.log("Could not start IPC server:", e.message);
        }
    }

    // ── Event Binding ───────────────────────────────────────────

    function bindEvents() {

        // ── Search Input ────────────────────────────────
        $searchInput.addEventListener("input", function () {
            var query = this.value.trim();
            $searchClear.classList.toggle("visible", query.length > 0);
            performSearch(query);
        });

        $searchClear.addEventListener("click", function () {
            $searchInput.value = "";
            $searchClear.classList.remove("visible");
            performSearch("");
            $searchInput.focus();
        });

        // ── Keyboard Navigation ─────────────────────────
        document.addEventListener("keydown", function (e) {
            // Close context menu on any key
            hideContextMenu();

            // Ctrl+Space within extension
            if (e.ctrlKey && (e.code === "Space" || e.keyCode === 32)) {
                e.preventDefault();
                e.stopPropagation();
                switchMode("search");
                $searchInput.focus();
                $searchInput.select();
                return;
            }

            // Mode shortcuts
            if (e.ctrlKey && e.key === "f") {
                e.preventDefault();
                switchMode("search");
                return;
            }
            if (e.ctrlKey && e.key === "g") {
                e.preventDefault();
                switchMode("gallery");
                return;
            }
            if (e.ctrlKey && e.key === ",") {
                e.preventDefault();
                switchMode("settings");
                return;
            }

            // Screenshot shortcuts
            if (e.key === "F5") {
                e.preventDefault();
                captureScreenshot(e.shiftKey);
                return;
            }

            // Search mode keyboard handling
            if (currentMode === "search") {
                // Number keys 1-9 for favorites (when search is empty)
                if (!e.ctrlKey && !e.altKey && e.key >= "1" && e.key <= "9" && $searchInput.value === "") {
                    e.preventDefault();
                    triggerFavorite(parseInt(e.key));
                    return;
                }

                // Arrow navigation
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

                // Enter to apply
                if (e.key === "Enter") {
                    e.preventDefault();
                    applyResultAtIndex(selectedIndex);
                    return;
                }

                // Escape to clear
                if (e.key === "Escape") {
                    if ($searchInput.value) {
                        $searchInput.value = "";
                        $searchClear.classList.remove("visible");
                        performSearch("");
                    }
                    return;
                }

                // Focus search on any printable character
                if (e.key.length === 1 && !e.ctrlKey && !e.altKey &&
                    document.activeElement !== $searchInput) {
                    $searchInput.focus();
                }
            }
        });

        // ── Mode Tabs ───────────────────────────────────
        var modeTabs = document.querySelectorAll(".mode-tab");
        for (var i = 0; i < modeTabs.length; i++) {
            modeTabs[i].addEventListener("click", function () {
                switchMode(this.dataset.mode);
            });
        }

        // ── Filter Chips ────────────────────────────────
        var filterChips = $filterBar.querySelectorAll(".filter-chip");
        for (var f = 0; f < filterChips.length; f++) {
            filterChips[f].addEventListener("click", function () {
                for (var fc = 0; fc < filterChips.length; fc++) {
                    filterChips[fc].classList.remove("active");
                }
                this.classList.add("active");
                currentFilter = this.dataset.filter;
                performSearch($searchInput.value.trim());
            });
        }

        // ── Context Menu ────────────────────────────────
        document.addEventListener("click", function () { hideContextMenu(); });

        var ctxItems = $contextMenu.querySelectorAll(".context-menu-item");
        for (var c = 0; c < ctxItems.length; c++) {
            ctxItems[c].addEventListener("click", function () {
                if (!contextTarget) return;
                var action = this.dataset.action;

                if (action === "apply") {
                    applyEffect(contextTarget);
                } else if (action === "add-favorite") {
                    assignToFavorite(contextTarget);
                } else if (action === "add-alias") {
                    switchMode("settings");
                    setTimeout(function () {
                        $newAliasValue.value = contextTarget.name;
                        $newAliasKey.focus();
                    }, 100);
                } else if (action === "copy-name") {
                    try {
                        navigator.clipboard.writeText(contextTarget.name);
                        toast("Copied: " + contextTarget.name, "success");
                    } catch (e) {
                        toast("Copy failed", "error");
                    }
                }
                hideContextMenu();
            });
        }

        // ── Gallery Events ──────────────────────────────
        $captureBtn.addEventListener("click", function () { captureScreenshot(false); });
        $captureClipboardBtn.addEventListener("click", function () { captureScreenshot(true); });
        $clearGalleryBtn.addEventListener("click", function () {
            FXGallery.clearAll();
            renderGallery();
            toast("Gallery cleared", "success");
        });

        // ── Settings Events ─────────────────────────────
        $screenshotDir.addEventListener("change", function () {
            var dir = this.value.trim();
            if (dir) {
                FXGallery.setOutputDir(dir);
                localStorage.setItem(SCREENSHOT_DIR_KEY, dir);
                toast("Screenshot directory updated", "success");
            }
        });

        $refreshEffectsBtn.addEventListener("click", function () { loadEffects(); });

        // Alias add
        $addAliasBtn.addEventListener("click", function () {
            var key = $newAliasKey.value.trim();
            var value = $newAliasValue.value.trim();
            if (key && value) {
                FXAliases.set(key, value);
                FXSearch.setAliases(FXAliases.getAll());
                renderAliasTable();
                $newAliasKey.value = "";
                $newAliasValue.value = "";
                toast("Alias added: " + key + " → " + value, "success");
            }
        });

        // Alias export/import/reset
        document.getElementById("exportAliasesBtn").addEventListener("click", function () {
            downloadJson("fxconsole-aliases.json", FXAliases.exportData());
        });
        document.getElementById("resetAliasesBtn").addEventListener("click", function () {
            FXAliases.resetToDefaults();
            FXSearch.setAliases(FXAliases.getAll());
            renderAliasTable();
            toast("Aliases reset to defaults", "success");
        });

        // Favorites export/import/clear
        document.getElementById("exportFavsBtn").addEventListener("click", function () {
            downloadJson("fxconsole-favorites.json", FXFavorites.exportData());
        });
        document.getElementById("clearFavsBtn").addEventListener("click", function () {
            FXFavorites.clearAll();
            renderFavoritesEditor();
            toast("All favorites cleared", "success");
        });

        // ── Diagnostics Drawer Events ───────────────────
        var $logsTabBtn = document.getElementById("logsTabBtn");
        if ($logsTabBtn) {
            $logsTabBtn.addEventListener("click", function () {
                toggleDiagnosticDrawer();
            });
        }
        var $searchDiagBtn = document.getElementById("searchDiagBtn");
        if ($searchDiagBtn) {
            $searchDiagBtn.addEventListener("click", function () {
                toggleDiagnosticDrawer();
            });
        }
        var $statusLeft = document.getElementById("statusLeft");
        if ($statusLeft) {
            $statusLeft.addEventListener("click", function () {
                toggleDiagnosticDrawer();
            });
        }
        if ($errorBadgeBtn) {
            $errorBadgeBtn.addEventListener("click", function () {
                toggleDiagnosticDrawer();
            });
        }
        if ($drawerCloseBtn) {
            $drawerCloseBtn.addEventListener("click", function () {
                toggleDiagnosticDrawer();
            });
        }
        if ($runDiagTestBtn) {
            $runDiagTestBtn.addEventListener("click", function () {
                runDiagnosticTest();
            });
        }
        if ($copyDiagBtn) {
            $copyDiagBtn.addEventListener("click", function () {
                copyDiagnosticLogs();
            });
        }
        if ($clearDiagBtn) {
            $clearDiagBtn.addEventListener("click", function () {
                clearDiagnosticLogs();
            });
        }
    }

    // ── Diagnostics Functions ───────────────────────────────────

    function updateDiagnosticLogs(logs, status, errors) {
        if (!logs) return;
        var text = Array.isArray(logs) ? logs.join("\n") : String(logs);
        if ($diagLogPre) $diagLogPre.textContent = text;
        diagnosticHistory = Array.isArray(logs) ? logs : [text];

        if (status === "error") {
            var errMsg = (errors && errors.length > 0) ? errors.join("\n") : "Operation failed";
            if ($diagStatusBox) {
                $diagStatusBox.className = "diag-status-box error";
                $diagStatusBox.textContent = "❌ " + errMsg;
            }
            setErrorBadge(errMsg);
        } else {
            if ($diagStatusBox) {
                $diagStatusBox.className = "diag-status-box success";
                $diagStatusBox.textContent = "✅ Last operation succeeded.";
            }
        }
    }

    function setErrorBadge(msg) {
        errorCount++;
        if ($errorBadgeBtn) {
            $errorBadgeBtn.classList.add("has-error");
            $errorBadgeBtn.title = "Errors detected! Click to inspect details.";
        }
        if ($errorBadgeCount) {
            $errorBadgeCount.textContent = errorCount;
            $errorBadgeCount.style.display = "inline-block";
        }
        var sBtn = document.getElementById("searchDiagBtn");
        if (sBtn) sBtn.style.display = "inline-block";
        var sBadge = document.getElementById("statusErrBadge");
        if (sBadge) sBadge.style.display = "inline-block";
        var lTab = document.getElementById("logsTabBtn");
        if (lTab) {
            lTab.style.color = "#ff6b6b";
            lTab.textContent = "⚠️ Logs (" + errorCount + ")";
        }
    }

    function clearErrorBadge() {
        errorCount = 0;
        if ($errorBadgeBtn) $errorBadgeBtn.classList.remove("has-error");
        if ($errorBadgeCount) $errorBadgeCount.style.display = "none";
        var sBtn = document.getElementById("searchDiagBtn");
        if (sBtn) sBtn.style.display = "none";
        var sBadge = document.getElementById("statusErrBadge");
        if (sBadge) sBadge.style.display = "none";
        var lTab = document.getElementById("logsTabBtn");
        if (lTab) {
            lTab.style.color = "";
            lTab.textContent = "⚠️ Logs";
        }
    }

    function toggleDiagnosticDrawer() {
        if (!$diagnosticDrawer) return;
        $diagnosticDrawer.classList.toggle("open");
    }

    function runDiagnosticTest() {
        if ($diagStatusBox) {
            $diagStatusBox.className = "diag-status-box";
            $diagStatusBox.textContent = "Running engine self-test...";
        }
        if ($diagLogPre) $diagLogPre.textContent = "Testing Premiere Pro ExtendScript / QE environment...";

        cs.evalScript("testEffectEngine('Gaussian Blur')", function (resStr) {
            if (!resStr || resStr === "EvalScript error.") {
                cs.evalScript("$.error + ' (line ' + $.line + ')'", function (errDetails) {
                    var msg = "ExtendScript Host Error: " + (errDetails || "Evaluation failed. Check if an active sequence is open in Premiere Pro.");
                    if ($diagStatusBox) {
                        $diagStatusBox.className = "diag-status-box error";
                        $diagStatusBox.textContent = "❌ " + msg;
                    }
                    if ($diagLogPre) $diagLogPre.textContent = "// ExtendScript Error Details:\n" + msg;
                    setErrorBadge(msg);
                });
                return;
            }

            try {
                var report = JSON.parse(resStr);
                var formatted = JSON.stringify(report, null, 2);
                if ($diagLogPre) $diagLogPre.textContent = formatted;
                diagnosticHistory = [formatted];

                if (report.qeEnabled && report.testEffectResolved) {
                    if ($diagStatusBox) {
                        $diagStatusBox.className = "diag-status-box success";
                        $diagStatusBox.textContent = "✅ QE Engine Verified: Sequence '" + (report.activeSequence || "Active") + "' loaded, Gaussian Blur is recognized!";
                    }
                } else {
                    if ($diagStatusBox) {
                        $diagStatusBox.className = "diag-status-box error";
                        $diagStatusBox.textContent = "⚠️ QE Issue: " + (report.errors.join(", ") || "Could not resolve Gaussian Blur in QE");
                    }
                }
            } catch (e) {
                if ($diagStatusBox) {
                    $diagStatusBox.className = "diag-status-box error";
                    $diagStatusBox.textContent = "Parse error: " + e.message;
                }
                if ($diagLogPre) $diagLogPre.textContent = resStr;
            }
        });
    }

    function copyDiagnosticLogs() {
        if (!$diagLogPre) return;
        var text = $diagLogPre.textContent;
        navigator.clipboard.writeText(text).then(function () {
            toast("Diagnostic log copied to clipboard!", "success");
        }).catch(function () {
            toast("Failed to copy log", "error");
        });
    }

    function clearDiagnosticLogs() {
        if ($diagLogPre) $diagLogPre.textContent = "// Cleared.";
        if ($diagStatusBox) {
            $diagStatusBox.className = "diag-status-box";
            $diagStatusBox.textContent = "Logs cleared.";
        }
        clearErrorBadge();
    }

    // ── Utilities ───────────────────────────────────────────────

    function escapeHtml(str) {
        var div = document.createElement("div");
        div.appendChild(document.createTextNode(str || ""));
        return div.innerHTML;
    }

    function escapeJsx(str) {
        return (str || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/'/g, "\\'");
    }

    function getTypeAbbr(type) {
        switch (type) {
            case "videoEffect":     return "VE";
            case "audioEffect":     return "AE";
            case "videoTransition": return "VT";
            case "audioTransition": return "AT";
            case "preset":          return "PR";
            default:                return "FX";
        }
    }

    function formatTimestamp(isoStr) {
        try {
            var d = new Date(isoStr);
            return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
                   " " + d.toLocaleDateString([], { month: "short", day: "numeric" });
        } catch (e) {
            return isoStr;
        }
    }

    function downloadJson(filename, jsonStr) {
        try {
            var blob = new Blob([jsonStr], { type: "application/json" });
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            toast("Export failed: " + e.message, "error");
        }
    }

    // ── Boot ────────────────────────────────────────────────────
    init();

})();
