/**
 * AJ Console for Premiere Pro — ExtendScript Host
 * ================================================
 * Backend script that runs inside Premiere Pro's ExtendScript engine.
 * Communicates with the CEP panel via csInterface.evalScript().
 */

// ─── Embedded JSON Polyfill for ExtendScript ─────────────────────────
var JSON;
if (!JSON) {
    JSON = {};
}
if (typeof JSON.stringify !== "function") {
    JSON.stringify = function (obj) {
        var t = typeof obj;
        if (t !== "object" || obj === null) {
            if (t === "string") return '"' + obj.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t") + '"';
            return String(obj);
        }
        var json = [];
        var isArr = (obj && obj.constructor === Array);
        for (var n in obj) {
            if (obj.hasOwnProperty(n)) {
                var v = obj[n];
                var vt = typeof v;
                if (vt === "function" || vt === "undefined") continue;
                if (vt === "string") v = '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t") + '"';
                else if (vt === "object" && v !== null) v = JSON.stringify(v);
                json.push((isArr ? "" : '"' + n + '":') + String(v));
            }
        }
        return (isArr ? "[" : "{") + json.join(",") + (isArr ? "]" : "}");
    };
}
if (typeof JSON.parse !== "function") {
    JSON.parse = function (str) {
        return eval("(" + str + ")");
    };
}

// ─── QE Initialization ───────────────────────────────────────────────
try {
    app.enableQE();
} catch (e) {
    // QE may already be enabled or unavailable
}

// ─── Master Built-in Premiere Pro Effects Catalog ─────────────────────
var BUILTIN_EFFECTS = [
    // ── Video Effects: Blur & Sharpen ─────────────────────────────────
    { name: "Gaussian Blur", matchName: "AE.ADBE Gaussian Blur 2", type: "videoEffect", category: "Blur & Sharpen" },
    { name: "Directional Blur", matchName: "AE.ADBE Motion Blur", type: "videoEffect", category: "Blur & Sharpen" },
    { name: "Fast Blur", matchName: "AE.ADBE Fast Blur", type: "videoEffect", category: "Blur & Sharpen" },
    { name: "Camera Blur", matchName: "AE.ADBE Camera Blur", type: "videoEffect", category: "Blur & Sharpen" },
    { name: "Channel Blur", matchName: "AE.ADBE Channel Blur", type: "videoEffect", category: "Blur & Sharpen" },
    { name: "Compound Blur", matchName: "AE.ADBE Compound Blur", type: "videoEffect", category: "Blur & Sharpen" },
    { name: "Radial Blur", matchName: "AE.ADBE Radial Blur", type: "videoEffect", category: "Blur & Sharpen" },
    { name: "Sharpen", matchName: "AE.ADBE Sharpen", type: "videoEffect", category: "Blur & Sharpen" },
    { name: "Unsharp Mask", matchName: "AE.ADBE Unsharp Mask", type: "videoEffect", category: "Blur & Sharpen" },

    // ── Video Effects: Color Correction ───────────────────────────────
    { name: "Lumetri Color", matchName: "AE.ADBE Lumetri", type: "videoEffect", category: "Color Correction" },
    { name: "Brightness & Contrast", matchName: "AE.ADBE Brightness & Contrast 2", type: "videoEffect", category: "Color Correction" },
    { name: "Color Balance", matchName: "AE.ADBE Color Balance (HLS) 2", type: "videoEffect", category: "Color Correction" },
    { name: "Color Balance (RGB)", matchName: "AE.ADBE Color Balance 2", type: "videoEffect", category: "Color Correction" },
    { name: "Levels", matchName: "AE.ADBE ProLevels", type: "videoEffect", category: "Color Correction" },
    { name: "Tint", matchName: "AE.ADBE Tint", type: "videoEffect", category: "Color Correction" },
    { name: "Exposure", matchName: "AE.ADBE Exposure", type: "videoEffect", category: "Color Correction" },
    { name: "Video Limiter", matchName: "AE.ADBE Video Limiter", type: "videoEffect", category: "Color Correction" },
    { name: "ASC CDL", matchName: "AE.ADBE CDL", type: "videoEffect", category: "Color Correction" },

    // ── Video Effects: Distort & Transform ────────────────────────────
    { name: "Crop", matchName: "AE.ADBE Crop", type: "videoEffect", category: "Transform" },
    { name: "Transform", matchName: "AE.ADBE Geometry2", type: "videoEffect", category: "Distort" },
    { name: "Warp Stabilizer", matchName: "AE.ADBE SubspaceStabilizer", type: "videoEffect", category: "Distort" },
    { name: "Corner Pin", matchName: "AE.ADBE Corner Pin", type: "videoEffect", category: "Distort" },
    { name: "Lens Distortion", matchName: "AE.ADBE Lens Distortion", type: "videoEffect", category: "Distort" },
    { name: "Horizontal Flip", matchName: "AE.ADBE Horiz Flip", type: "videoEffect", category: "Transform" },
    { name: "Vertical Flip", matchName: "AE.ADBE Vert Flip", type: "videoEffect", category: "Transform" },
    { name: "Mirror", matchName: "AE.ADBE Mirror", type: "videoEffect", category: "Distort" },
    { name: "Spherize", matchName: "AE.ADBE Spherize", type: "videoEffect", category: "Distort" },
    { name: "Twirl", matchName: "AE.ADBE Twirl", type: "videoEffect", category: "Distort" },
    { name: "Wave Warp", matchName: "AE.ADBE Wave Warp", type: "videoEffect", category: "Distort" },
    { name: "Ripple", matchName: "AE.ADBE Ripple", type: "videoEffect", category: "Distort" },
    { name: "Turbulent Displace", matchName: "AE.ADBE Turbulent Displace", type: "videoEffect", category: "Distort" },
    { name: "Magnify", matchName: "AE.ADBE Magnify", type: "videoEffect", category: "Distort" },
    { name: "Offset", matchName: "AE.ADBE Offset", type: "videoEffect", category: "Distort" },

    // ── Video Effects: Keying ─────────────────────────────────────────
    { name: "Ultra Key", matchName: "AE.ADBE Ultra Key", type: "videoEffect", category: "Keying" },
    { name: "Color Key", matchName: "AE.ADBE Color Key", type: "videoEffect", category: "Keying" },
    { name: "Luma Key", matchName: "AE.ADBE Luma Key", type: "videoEffect", category: "Keying" },
    { name: "Track Matte Key", matchName: "AE.ADBE Track Matte Key", type: "videoEffect", category: "Keying" },
    { name: "Difference Matte", matchName: "AE.ADBE Difference Matte", type: "videoEffect", category: "Keying" },
    { name: "Alpha Adjust", matchName: "AE.ADBE Alpha Adjust", type: "videoEffect", category: "Keying" },

    // ── Video Effects: Perspective & Stylize ──────────────────────────
    { name: "Basic 3D", matchName: "AE.ADBE Basic 3D", type: "videoEffect", category: "Perspective" },
    { name: "Drop Shadow", matchName: "AE.ADBE Drop Shadow", type: "videoEffect", category: "Perspective" },
    { name: "Radial Shadow", matchName: "AE.ADBE Radial Shadow", type: "videoEffect", category: "Perspective" },
    { name: "Find Edges", matchName: "AE.ADBE Find Edges", type: "videoEffect", category: "Stylize" },
    { name: "Mosaic", matchName: "AE.ADBE Mosaic", type: "videoEffect", category: "Stylize" },
    { name: "Posterize", matchName: "AE.ADBE Posterize", type: "videoEffect", category: "Stylize" },
    { name: "Threshold", matchName: "AE.ADBE Threshold", type: "videoEffect", category: "Stylize" },
    { name: "Strobe Light", matchName: "AE.ADBE Strobe Light", type: "videoEffect", category: "Stylize" },
    { name: "Roughen Edges", matchName: "AE.ADBE Roughen Edges", type: "videoEffect", category: "Stylize" },
    { name: "Emboss", matchName: "AE.ADBE Emboss", type: "videoEffect", category: "Stylize" },

    // ── Video Effects: Generate & Noise ───────────────────────────────
    { name: "4-Color Gradient", matchName: "AE.ADBE 4ColorGradient", type: "videoEffect", category: "Generate" },
    { name: "Ramp", matchName: "AE.ADBE Ramp", type: "videoEffect", category: "Generate" },
    { name: "Grid", matchName: "AE.ADBE Grid", type: "videoEffect", category: "Generate" },
    { name: "Lens Flare", matchName: "AE.ADBE Lens Flare", type: "videoEffect", category: "Generate" },
    { name: "Lightning", matchName: "AE.ADBE Lightning", type: "videoEffect", category: "Generate" },
    { name: "Checkerboard", matchName: "AE.ADBE Checkerboard", type: "videoEffect", category: "Generate" },
    { name: "Circle", matchName: "AE.ADBE Circle", type: "videoEffect", category: "Generate" },
    { name: "Noise", matchName: "AE.ADBE Noise", type: "videoEffect", category: "Noise & Grain" },
    { name: "Noise Alpha", matchName: "AE.ADBE Noise Alpha", type: "videoEffect", category: "Noise & Grain" },
    { name: "Dust & Scratches", matchName: "AE.ADBE Dust & Scratches", type: "videoEffect", category: "Noise & Grain" },
    { name: "Median", matchName: "AE.ADBE Median", type: "videoEffect", category: "Noise & Grain" },

    // ── Audio Effects ─────────────────────────────────────────────────
    { name: "DeNoise", matchName: "DeNoise", type: "audioEffect", category: "Noise Reduction" },
    { name: "DeReverb", matchName: "DeReverb", type: "audioEffect", category: "Noise Reduction" },
    { name: "Parametric Equalizer", matchName: "Parametric EQ", type: "audioEffect", category: "Filter & EQ" },
    { name: "Hard Limiter", matchName: "Hard Limiter", type: "audioEffect", category: "Amplitude & Compression" },
    { name: "Multiband Compressor", matchName: "Multiband Compressor", type: "audioEffect", category: "Amplitude & Compression" },
    { name: "Dynamics", matchName: "Dynamics", type: "audioEffect", category: "Amplitude & Compression" },
    { name: "Graphic Equalizer (10 Bands)", matchName: "Graphic EQ (10 Bands)", type: "audioEffect", category: "Filter & EQ" },
    { name: "Bass", matchName: "Bass", type: "audioEffect", category: "Filter & EQ" },
    { name: "Treble", matchName: "Treble", type: "audioEffect", category: "Filter & EQ" },
    { name: "Studio Reverb", matchName: "Studio Reverb", type: "audioEffect", category: "Reverb" },
    { name: "Delay", matchName: "Delay", type: "audioEffect", category: "Delay & Echo" },
    { name: "Volume", matchName: "Volume", type: "audioEffect", category: "Amplitude & Compression" },

    // ── Video Transitions ─────────────────────────────────────────────
    { name: "Cross Dissolve", matchName: "Cross Dissolve", type: "videoTransition", category: "Dissolve" },
    { name: "Dip to Black", matchName: "Dip to Black", type: "videoTransition", category: "Dissolve" },
    { name: "Dip to White", matchName: "Dip to White", type: "videoTransition", category: "Dissolve" },
    { name: "Film Dissolve", matchName: "Film Dissolve", type: "videoTransition", category: "Dissolve" },
    { name: "Morph Cut", matchName: "Morph Cut", type: "videoTransition", category: "Dissolve" },
    { name: "Wipe", matchName: "Wipe", type: "videoTransition", category: "Wipe" },
    { name: "Slide", matchName: "Slide", type: "videoTransition", category: "Slide" },
    { name: "Push", matchName: "Push", type: "videoTransition", category: "Slide" },
    { name: "Cross Zoom", matchName: "Cross Zoom", type: "videoTransition", category: "Zoom" },

    // ── Audio Transitions ─────────────────────────────────────────────
    { name: "Constant Power", matchName: "Constant Power", type: "audioTransition", category: "Crossfade" },
    { name: "Constant Gain", matchName: "Constant Gain", type: "audioTransition", category: "Crossfade" },
    { name: "Exponential Fade", matchName: "Exponential Fade", type: "audioTransition", category: "Crossfade" }
];

// ─── Helpers to Parse QE Raw Lists ────────────────────────────────────
function parseQERawList(rawList, effectType, categoryName) {
    var results = [];
    if (!rawList) return results;

    var items = [];
    if (typeof rawList === "string") {
        items = rawList.split(/[\r\n,]+/);
    } else if (rawList.length !== undefined) {
        for (var i = 0; i < rawList.length; i++) {
            items.push(rawList[i]);
        }
    }

    for (var j = 0; j < items.length; j++) {
        var raw = items[j];
        if (!raw) continue;
        if (typeof raw === "object" && raw.name) {
            raw = raw.name;
        }
        var rawStr = ("" + raw).replace(/^\s+|\s+$/g, "");
        if (rawStr.length === 0) continue;

        var cleanName = rawStr;
        cleanName = cleanName.replace(/^(AE\.)?ADBE\s*/i, "");
        cleanName = cleanName.replace(/\s*\d+$/, "");

        results.push({
            name: cleanName,
            matchName: rawStr,
            type: effectType,
            category: categoryName
        });
    }

    return results;
}

// ─── Effect Listing ──────────────────────────────────────────────────

function getAllEffects() {
    var effectsMap = {};
    var effects = [];

    // 1. Seed with built-in catalog
    for (var b = 0; b < BUILTIN_EFFECTS.length; b++) {
        var item = BUILTIN_EFFECTS[b];
        effectsMap[item.name.toLowerCase()] = item;
    }

    // 2. Scan QE DOM to add any installed 3rd party plugins
    try {
        app.enableQE();

        try {
            var rawVE = qe.project.getVideoEffectList();
            var veItems = parseQERawList(rawVE, "videoEffect", "Video Effects");
            for (var v = 0; v < veItems.length; v++) {
                var vKey = veItems[v].name.toLowerCase();
                if (!effectsMap[vKey]) {
                    effectsMap[vKey] = veItems[v];
                }
            }
        } catch (veErr) {}

        try {
            var rawAE = qe.project.getAudioEffectList();
            var aeItems = parseQERawList(rawAE, "audioEffect", "Audio Effects");
            for (var a = 0; a < aeItems.length; a++) {
                var aKey = aeItems[a].name.toLowerCase();
                if (!effectsMap[aKey]) {
                    effectsMap[aKey] = aeItems[a];
                }
            }
        } catch (aeErr) {}

        try {
            var rawVT = qe.project.getVideoTransitionList();
            var vtItems = parseQERawList(rawVT, "videoTransition", "Video Transitions");
            for (var t = 0; t < vtItems.length; t++) {
                var tKey = vtItems[t].name.toLowerCase();
                if (!effectsMap[tKey]) {
                    effectsMap[tKey] = vtItems[t];
                }
            }
        } catch (vtErr) {}

        try {
            var rawAT = qe.project.getAudioTransitionList();
            var atItems = parseQERawList(rawAT, "audioTransition", "Audio Transitions");
            for (var m = 0; m < atItems.length; m++) {
                var mKey = atItems[m].name.toLowerCase();
                if (!effectsMap[mKey]) {
                    effectsMap[mKey] = atItems[m];
                }
            }
        } catch (atErr) {}

    } catch (qeErr) {}

    for (var key in effectsMap) {
        if (effectsMap.hasOwnProperty(key)) {
            effects.push(effectsMap[key]);
        }
    }

    return JSON.stringify(effects);
}

// ─── Robust QE Effect Resolver ────────────────────────────────────────

function isValidQEItem(eff) {
    if (!eff || typeof eff !== "object") return false;
    if (typeof eff.name === "string") {
        return eff.name.length > 0;
    }
    return true;
}

function findQEVideoEffect(effectName, matchName, logs) {
    var eff = null;

    // 1. Clean display name is what QE DOM expects first and foremost
    try {
        eff = qe.project.getVideoEffectByName(effectName);
        if (isValidQEItem(eff)) { logs.push("Found video effect by clean name: " + effectName + " (QE: " + eff.name + ")"); return eff; }
    } catch (e) {}

    try {
        eff = qe.project.getVideoEffectByName(effectName, true);
        if (isValidQEItem(eff)) { logs.push("Found video effect by partial clean name: " + effectName + " (QE: " + eff.name + ")"); return eff; }
    } catch (e) {}

    // 2. Try matchName if provided and different from effectName
    if (matchName && matchName !== effectName) {
        try {
            eff = qe.project.getVideoEffectByName(matchName);
            if (isValidQEItem(eff)) { logs.push("Found video effect by matchName: " + matchName + " (QE: " + eff.name + ")"); return eff; }
        } catch (e) {}
        try {
            eff = qe.project.getVideoEffectByName(matchName, true);
            if (isValidQEItem(eff)) { logs.push("Found video effect by partial matchName: " + matchName + " (QE: " + eff.name + ")"); return eff; }
        } catch (e) {}
    }

    // 3. Try standard Adobe prefixes
    var prefixes = ["AE.ADBE ", "ADBE ", "AE."];
    for (var p = 0; p < prefixes.length; p++) {
        var preCandidate = prefixes[p] + effectName;
        try {
            eff = qe.project.getVideoEffectByName(preCandidate);
            if (isValidQEItem(eff)) { logs.push("Found video effect with prefix: " + preCandidate); return eff; }
        } catch (e) {}
        try {
            eff = qe.project.getVideoEffectByName(preCandidate, true);
            if (isValidQEItem(eff)) { logs.push("Found video effect with prefix (partial): " + preCandidate); return eff; }
        } catch (e) {}
    }

    // 4. Dynamic search across raw effect list
    try {
        var rawList = qe.project.getVideoEffectList();
        var lines = ("" + rawList).split(/[\r\n,]+/);
        var searchLow = effectName.toLowerCase();
        for (var i = 0; i < lines.length; i++) {
            var itemStr = lines[i].replace(/^\s+|\s+$/g, "");
            if (itemStr.length > 0 && itemStr.toLowerCase().indexOf(searchLow) !== -1) {
                try {
                    eff = qe.project.getVideoEffectByName(itemStr);
                    if (isValidQEItem(eff)) {
                        logs.push("Found video effect in raw list: " + itemStr);
                        return eff;
                    }
                } catch (e) {}
            }
        }
    } catch (e) {
        logs.push("Error querying getVideoEffectList: " + e.toString());
    }

    return null;
}

function findQEAudioEffect(effectName, matchName, logs) {
    var eff = null;

    // 1. Clean display name first
    try {
        eff = qe.project.getAudioEffectByName(effectName);
        if (isValidQEItem(eff)) { logs.push("Found audio effect by clean name: " + effectName); return eff; }
    } catch (e) {}

    try {
        eff = qe.project.getAudioEffectByName(effectName, true);
        if (isValidQEItem(eff)) { logs.push("Found audio effect by partial clean name: " + effectName); return eff; }
    } catch (e) {}

    // 2. matchName if provided
    if (matchName && matchName !== effectName) {
        try {
            eff = qe.project.getAudioEffectByName(matchName);
            if (isValidQEItem(eff)) { logs.push("Found audio effect by matchName: " + matchName); return eff; }
        } catch (e) {}
        try {
            eff = qe.project.getAudioEffectByName(matchName, true);
            if (isValidQEItem(eff)) { logs.push("Found audio effect by partial matchName: " + matchName); return eff; }
        } catch (e) {}
    }

    // 3. Raw list scan
    try {
        var rawList = qe.project.getAudioEffectList();
        var lines = ("" + rawList).split(/[\r\n,]+/);
        var searchLow = effectName.toLowerCase();
        for (var i = 0; i < lines.length; i++) {
            var itemStr = lines[i].replace(/^\s+|\s+$/g, "");
            if (itemStr.length > 0 && itemStr.toLowerCase().indexOf(searchLow) !== -1) {
                try {
                    eff = qe.project.getAudioEffectByName(itemStr);
                    if (isValidQEItem(eff)) {
                        logs.push("Found audio effect in raw list: " + itemStr);
                        return eff;
                    }
                } catch (e) {}
            }
        }
    } catch (e) {}

    return null;
}

// ─── Exact QE Track Item Matcher ─────────────────────────────────────

function getQEItemTicks(qItem, prop) {
    try {
        if (qItem && qItem[prop] !== undefined && qItem[prop] !== null) {
            if (qItem[prop].ticks !== undefined) {
                return String(qItem[prop].ticks);
            }
            return String(qItem[prop]);
        }
    } catch (e) {}
    return "";
}

function findMatchingQEItem(qeTrack, clipObj, clipIndex, logs) {
    if (!qeTrack) return null;

    var clipName = clipObj.name || "";
    var tgtStart = (clipObj.start && clipObj.start.ticks !== undefined) ? String(clipObj.start.ticks) : "";
    var tgtEnd = (clipObj.end && clipObj.end.ticks !== undefined) ? String(clipObj.end.ticks) : "";

    var clipItems = [];
    for (var i = 0; i < qeTrack.numItems; i++) {
        var qItem = qeTrack.getItemAt(i);
        if (!qItem) continue;
        var qType = "";
        try { qType = String(qItem.type || ""); } catch (e) {}
        if (qType === "Empty" || qType === "Transition") continue;
        clipItems.push({ item: qItem, qeIndex: i });
    }

    // Pass 1: Match by exact start AND end ticks
    if (tgtStart.length > 0 && tgtEnd.length > 0) {
        for (var a = 0; a < clipItems.length; a++) {
            var s1 = getQEItemTicks(clipItems[a].item, "start");
            var e1 = getQEItemTicks(clipItems[a].item, "end");
            if (s1 === tgtStart && e1 === tgtEnd) {
                logs.push("Matched QE item index " + clipItems[a].qeIndex + " by exact start+end ticks (" + s1 + ".." + e1 + ")");
                return clipItems[a].item;
            }
        }
    }

    // Pass 2: Match by exact start ticks
    if (tgtStart.length > 0) {
        for (var b = 0; b < clipItems.length; b++) {
            var s2 = getQEItemTicks(clipItems[b].item, "start");
            if (s2 === tgtStart) {
                logs.push("Matched QE item index " + clipItems[b].qeIndex + " by exact start ticks (" + s2 + ")");
                return clipItems[b].item;
            }
        }
    }

    // Pass 3: Match by exact chronological clip index on this track
    if (clipIndex !== undefined && clipIndex >= 0 && clipIndex < clipItems.length) {
        logs.push("Matched QE item index " + clipItems[clipIndex].qeIndex + " by exact track clipIndex (" + clipIndex + ")");
        return clipItems[clipIndex].item;
    }

    // Pass 4: Match by name ONLY if unambiguous (unique on this track)
    if (clipName.length > 0) {
        var nameMatches = [];
        for (var d = 0; d < clipItems.length; d++) {
            try {
                if (clipItems[d].item.name === clipName) {
                    nameMatches.push(clipItems[d]);
                }
            } catch (e) {}
        }
        if (nameMatches.length === 1) {
            logs.push("Matched QE item index " + nameMatches[0].qeIndex + " by unique name ('" + clipName + "')");
            return nameMatches[0].item;
        }
    }

    return null;
}

// ─── Apply Effect to Selected Clips ──────────────────────────────────

/**
 * Applies an effect by name ONLY to currently selected clips on their exact tracks.
 * Never falls back to unselected tracks, Track 0, or the playhead clip.
 */
function applyEffectToSelection(effectName, effectType, matchName) {
    var result = {
        success: false,
        applied: 0,
        clipNames: [],
        errors: [],
        logs: []
    };

    var logs = result.logs;
    logs.push("=== FX Console Apply Execution Started ===");
    logs.push("Target effect: '" + effectName + "' | Type: '" + effectType + "' | MatchName: '" + (matchName || "none") + "'");

    try {
        app.enableQE();
        var seq = app.project.activeSequence;
        if (!seq) {
            result.errors.push("No active sequence found in Premiere Pro.");
            logs.push("ERROR: app.project.activeSequence is null.");
            return JSON.stringify(result);
        }
        logs.push("Active sequence: '" + seq.name + "'");

        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) {
            result.errors.push("QE: Cannot access active sequence.");
            logs.push("ERROR: qe.project.getActiveSequence() returned null.");
            return JSON.stringify(result);
        }

        // 1. Resolve QE Effect
        var qeEffect = null;
        var normType = (effectType || "").toLowerCase();
        var isAudioEffectType = (normType === "audioeffect" || normType === "audiotransition" || normType.indexOf("audio") !== -1);
        var isVideoEffectType = (normType === "videoeffect" || normType === "videotransition" || normType === "video" || normType.indexOf("video") !== -1);

        if (isVideoEffectType) {
            if (normType.indexOf("trans") !== -1) {
                try { qeEffect = qe.project.getVideoTransitionByName(effectName); } catch (e) {}
                if (!isValidQEItem(qeEffect) && matchName) { try { qeEffect = qe.project.getVideoTransitionByName(matchName); } catch (e) {} }
                if (!isValidQEItem(qeEffect)) { try { qeEffect = qe.project.getVideoTransitionByName(effectName, true); } catch (e) {} }
            } else {
                qeEffect = findQEVideoEffect(effectName, matchName, logs);
            }
        } else if (isAudioEffectType) {
            if (normType.indexOf("trans") !== -1) {
                try { qeEffect = qe.project.getAudioTransitionByName(effectName); } catch (e) {}
                if (!isValidQEItem(qeEffect) && matchName) { try { qeEffect = qe.project.getAudioTransitionByName(matchName); } catch (e) {} }
                if (!isValidQEItem(qeEffect)) { try { qeEffect = qe.project.getAudioTransitionByName(effectName, true); } catch (e) {} }
            } else {
                qeEffect = findQEAudioEffect(effectName, matchName, logs);
            }
        } else if (normType.indexOf("trans") !== -1) {
            try { qeEffect = qe.project.getVideoTransitionByName(effectName); } catch (e) {}
            if (!isValidQEItem(qeEffect) && matchName) { try { qeEffect = qe.project.getVideoTransitionByName(matchName); } catch (e) {} }
            if (!isValidQEItem(qeEffect)) { try { qeEffect = qe.project.getVideoTransitionByName(effectName, true); } catch (e) {} }
            if (isValidQEItem(qeEffect)) isVideoEffectType = true;
        }

        // Fallback: If not found under specified type, try video then audio
        if (!isValidQEItem(qeEffect)) {
            qeEffect = findQEVideoEffect(effectName, matchName, logs);
            if (isValidQEItem(qeEffect)) isVideoEffectType = true;
        }
        if (!isValidQEItem(qeEffect)) {
            qeEffect = findQEAudioEffect(effectName, matchName, logs);
            if (isValidQEItem(qeEffect)) isAudioEffectType = true;
        }

        if (!qeEffect) {
            var notFoundErr = "Could not find effect '" + effectName + "' in Premiere Pro.";
            result.errors.push(notFoundErr);
            logs.push("ERROR: " + notFoundErr);
            return JSON.stringify(result);
        }
        logs.push("QE effect successfully resolved: " + (typeof qeEffect));

        // 2. Identify ONLY Selected Clips with their Exact Track Index & Clip Index
        var selectedTargets = []; // { clip, trackIndex, clipIndex, isVideo }

        // Method A (Primary & Exact): Walk each track and check clip.isSelected()
        // This guarantees 100% accurate trackIndex and clipIndex with zero cross-track ambiguity.
        for (var vt = 0; vt < seq.videoTracks.numTracks; vt++) {
            var vTrk = seq.videoTracks[vt];
            for (var vc = 0; vc < vTrk.clips.numItems; vc++) {
                var vClip = vTrk.clips[vc];
                try {
                    if (vClip.isSelected && vClip.isSelected()) {
                        selectedTargets.push({ clip: vClip, trackIndex: vt, clipIndex: vc, isVideo: true });
                        logs.push("Selected Video Clip: '" + vClip.name + "' on V" + (vt + 1) + " [idx=" + vc + "]");
                    }
                } catch (e) {}
            }
        }
        for (var at = 0; at < seq.audioTracks.numTracks; at++) {
            var aTrk = seq.audioTracks[at];
            for (var ac = 0; ac < aTrk.clips.numItems; ac++) {
                var aClip = aTrk.clips[ac];
                try {
                    if (aClip.isSelected && aClip.isSelected()) {
                        selectedTargets.push({ clip: aClip, trackIndex: at, clipIndex: ac, isVideo: false });
                        logs.push("Selected Audio Clip: '" + aClip.name + "' on A" + (at + 1) + " [idx=" + ac + "]");
                    }
                } catch (e) {}
            }
        }

        // Method B (Fallback only if isSelected() unavailable): seq.getSelection() with safe matching
        if (selectedTargets.length === 0) {
            try {
                var sel = seq.getSelection();
                if (sel && sel.length > 0) {
                    logs.push("Fallback seq.getSelection() returned " + sel.length + " item(s).");
                    for (var s = 0; s < sel.length; s++) {
                        var sItem = sel[s];
                        var sMediaType = "";
                        try { sMediaType = String(sItem.mediaType || ""); } catch (e) {}
                        var sStartTicks = (sItem.start && sItem.start.ticks !== undefined) ? String(sItem.start.ticks) : "";
                        var sEndTicks = (sItem.end && sItem.end.ticks !== undefined) ? String(sItem.end.ticks) : "";
                        var located = false;

                        if (sMediaType !== "Audio") {
                            for (var fvt = 0; fvt < seq.videoTracks.numTracks && !located; fvt++) {
                                var fvTrk = seq.videoTracks[fvt];
                                for (var fvc = 0; fvc < fvTrk.clips.numItems; fvc++) {
                                    var fvClip = fvTrk.clips[fvc];
                                    var fvStart = (fvClip.start && fvClip.start.ticks !== undefined) ? String(fvClip.start.ticks) : "";
                                    var fvEnd = (fvClip.end && fvClip.end.ticks !== undefined) ? String(fvClip.end.ticks) : "";
                                    var sameNode = (fvClip.nodeId !== undefined && sItem.nodeId !== undefined && fvClip.nodeId === sItem.nodeId);
                                    var sameBounds = (fvClip.name === sItem.name && fvStart === sStartTicks && fvEnd === sEndTicks);
                                    if (sameNode || sameBounds) {
                                        selectedTargets.push({ clip: fvClip, trackIndex: fvt, clipIndex: fvc, isVideo: true });
                                        located = true;
                                        break;
                                    }
                                }
                            }
                        }

                        if (!located && sMediaType !== "Video") {
                            for (var fat = 0; fat < seq.audioTracks.numTracks && !located; fat++) {
                                var faTrk = seq.audioTracks[fat];
                                for (var fac = 0; fac < faTrk.clips.numItems; fac++) {
                                    var faClip = faTrk.clips[fac];
                                    var faStart = (faClip.start && faClip.start.ticks !== undefined) ? String(faClip.start.ticks) : "";
                                    var faEnd = (faClip.end && faClip.end.ticks !== undefined) ? String(faClip.end.ticks) : "";
                                    var sameANode = (faClip.nodeId !== undefined && sItem.nodeId !== undefined && faClip.nodeId === sItem.nodeId);
                                    var sameABounds = (faClip.name === sItem.name && faStart === sStartTicks && faEnd === sEndTicks);
                                    if (sameANode || sameABounds) {
                                        selectedTargets.push({ clip: faClip, trackIndex: fat, clipIndex: fac, isVideo: false });
                                        located = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (selErr) {
                logs.push("Notice: seq.getSelection() fallback exception: " + selErr.toString());
            }
        }

        // Strict Selection Enforcement: NEVER apply to unselected clips or playhead clips
        if (selectedTargets.length === 0) {
            var noSelErr = "No clip selected on the timeline. Please select a clip first.";
            result.errors.push(noSelErr);
            logs.push("ERROR: " + noSelErr);
            return JSON.stringify(result);
        }

        // Filter targets to match effect media type (e.g. don't apply Video Blur to linked Audio track)
        var filteredTargets = [];
        for (var ft = 0; ft < selectedTargets.length; ft++) {
            var cand = selectedTargets[ft];
            if (isVideoEffectType && !isAudioEffectType && !cand.isVideo) {
                logs.push("Skipping linked audio clip '" + cand.clip.name + "' for video effect.");
                continue;
            }
            if (isAudioEffectType && !isVideoEffectType && cand.isVideo) {
                logs.push("Skipping linked video clip '" + cand.clip.name + "' for audio effect.");
                continue;
            }
            filteredTargets.push(cand);
        }

        if (filteredTargets.length === 0) {
            var mismatchErr = isVideoEffectType
                ? "Selected clip is audio-only. Please select a video/graphic clip for '" + effectName + "'."
                : "Selected clip is video-only. Please select an audio clip for '" + effectName + "'.";
            result.errors.push(mismatchErr);
            logs.push("ERROR: " + mismatchErr);
            return JSON.stringify(result);
        }

        logs.push("Target clips to process: " + filteredTargets.length);

        // 3. Apply Effect STRICTLY to each matched QE Track Item on its exact track
        for (var c = 0; c < filteredTargets.length; c++) {
            var target = filteredTargets[c];
            var clipObj = target.clip;
            var clipName = clipObj.name || "clip";
            var trkIdx = target.trackIndex;
            var clipIdx = target.clipIndex;
            var isVideo = target.isVideo;

            logs.push("Processing target " + (c + 1) + ": '" + clipName + "' on " + (isVideo ? "V" : "A") + (trkIdx + 1) + " [clipIndex=" + clipIdx + "]");

            // Record component count before
            var compsBefore = 0;
            try {
                if (clipObj.components) compsBefore = clipObj.components.numItems;
            } catch (e) {}
            logs.push("Components on clip before: " + compsBefore);

            if (isVideo) {
                var qeTrack = qeSeq.getVideoTrackAt(trkIdx);
                if (!qeTrack) {
                    var noTrkErr = "QE Video Track V" + (trkIdx + 1) + " could not be accessed.";
                    result.errors.push(noTrkErr);
                    logs.push("ERROR: " + noTrkErr);
                    continue;
                }

                logs.push("qeTrack V" + (trkIdx + 1) + " items count: " + qeTrack.numItems);
                var matchedQEItem = findMatchingQEItem(qeTrack, clipObj, clipIdx, logs);

                if (matchedQEItem) {
                    try {
                        var callRes = false;
                        if (normType.indexOf("trans") !== -1) {
                            callRes = matchedQEItem.addTransition(qeEffect);
                            if (!callRes) {
                                try { callRes = matchedQEItem.addTransition(qeEffect, 1); } catch (e) {}
                            }
                        } else {
                            if (qeEffect) {
                                callRes = matchedQEItem.addVideoEffect(qeEffect);
                                if (!callRes) {
                                    logs.push("addVideoEffect returned false. Trying with placement flag (1)...");
                                    try { callRes = matchedQEItem.addVideoEffect(qeEffect, 1); } catch (e) {}
                                }
                            }
                            if (!callRes) {
                                logs.push("Trying addVideoEffect directly with clean effect name: " + effectName);
                                try { callRes = matchedQEItem.addVideoEffect(effectName); } catch (e) {}
                            }
                            if (!callRes && matchName) {
                                logs.push("Trying addVideoEffect directly with matchName: " + matchName);
                                try { callRes = matchedQEItem.addVideoEffect(matchName); } catch (e) {}
                            }
                        }

                        logs.push("QE add call returned: " + callRes);

                        // Verify with standard DOM components
                        var compsAfter = compsBefore;
                        try {
                            if (clipObj.components) compsAfter = clipObj.components.numItems;
                        } catch (e) {}
                        logs.push("Components on clip after: " + compsAfter);

                        if (callRes || compsAfter > compsBefore) {
                            result.applied++;
                            result.clipNames.push(clipName);
                            logs.push("SUCCESS: Effect '" + effectName + "' attached to '" + clipName + "' on V" + (trkIdx + 1) + "!");
                        } else {
                            var warnMsg = "addVideoEffect failed to attach '" + effectName + "' to clip '" + clipName + "'.";
                            logs.push("ERROR: " + warnMsg);
                            result.errors.push(warnMsg);
                        }

                    } catch (addErr) {
                        var errStr = "Exception calling addVideoEffect on '" + clipName + "': " + addErr.toString();
                        result.errors.push(errStr);
                        logs.push("ERROR: " + errStr);
                    }
                } else {
                    var noItemErr = "Could not locate clip '" + clipName + "' on QE Video Track V" + (trkIdx + 1);
                    result.errors.push(noItemErr);
                    logs.push("ERROR: " + noItemErr);
                }
            } else {
                // Audio track
                var qeATrack = qeSeq.getAudioTrackAt(trkIdx);
                if (!qeATrack) {
                    var noATrkErr = "QE Audio Track A" + (trkIdx + 1) + " could not be accessed.";
                    result.errors.push(noATrkErr);
                    logs.push("ERROR: " + noATrkErr);
                    continue;
                }

                var matchedQEAItem = findMatchingQEItem(qeATrack, clipObj, clipIdx, logs);
                if (matchedQEAItem) {
                    try {
                        if (normType.indexOf("trans") !== -1) {
                            matchedQEAItem.addTransition(qeEffect);
                        } else {
                            matchedQEAItem.addAudioEffect(qeEffect);
                        }
                        result.applied++;
                        result.clipNames.push(clipName);
                        logs.push("SUCCESS: Audio effect '" + effectName + "' attached to '" + clipName + "' on A" + (trkIdx + 1) + "!");
                    } catch (aErr) {
                        var aErrStr = "Audio add error on '" + clipName + "': " + aErr.toString();
                        logs.push("ERROR: " + aErrStr);
                        result.errors.push(aErrStr);
                    }
                } else {
                    var noAItemErr = "Could not locate clip '" + clipName + "' on QE Audio Track A" + (trkIdx + 1);
                    result.errors.push(noAItemErr);
                    logs.push("ERROR: " + noAItemErr);
                }
            }
        }

        result.success = result.applied > 0;
        logs.push("Execution finished. Success: " + result.success + ", Total applied: " + result.applied);

    } catch (fatal) {
        result.errors.push("Fatal ExtendScript Error: " + fatal.toString());
        logs.push("FATAL: " + fatal.toString());
    }

    return JSON.stringify(result);
}

// ─── Test / Diagnostic Engine ────────────────────────────────────────

/**
 * Runs a comprehensive self-diagnostic test on the Premiere Pro scripting engine.
 * Tests QE initialization, effect lookup, sequence info, and returns a full report.
 */
function testEffectEngine(testEffectName) {
    var report = {
        qeEnabled: false,
        activeSequence: null,
        videoTracksCount: 0,
        audioTracksCount: 0,
        selectedClipsCount: 0,
        testEffectName: testEffectName || "Gaussian Blur",
        testEffectResolved: false,
        sampleInstalledEffects: [],
        errors: []
    };

    try {
        app.enableQE();
        report.qeEnabled = (typeof qe !== "undefined" && qe && qe.project);
    } catch (e) {
        report.errors.push("QE initialization failed: " + e.toString());
    }

    try {
        var seq = app.project.activeSequence;
        if (seq) {
            report.activeSequence = seq.name;
            report.videoTracksCount = seq.videoTracks.numTracks;
            report.audioTracksCount = seq.audioTracks.numTracks;

            var sel = seq.getSelection();
            report.selectedClipsCount = sel ? sel.length : 0;
        }
    } catch (e) {
        report.errors.push("Sequence check error: " + e.toString());
    }

    try {
        if (report.qeEnabled) {
            var rawList = qe.project.getVideoEffectList();
            var lines = ("" + rawList).split(/[\r\n,]+/);
            for (var i = 0; i < Math.min(lines.length, 15); i++) {
                var clean = lines[i].replace(/^\s+|\s+$/g, "");
                if (clean.length > 0) report.sampleInstalledEffects.push(clean);
            }

            var testEff = findQEVideoEffect(report.testEffectName, "AE.ADBE Gaussian Blur 2", []);
            report.testEffectResolved = (testEff !== null);
        }
    } catch (e) {
        report.errors.push("QE effect test error: " + e.toString());
    }

    return JSON.stringify(report);
}

// ─── Frame Capture / Screenshot ──────────────────────────────────────

function captureFrame(outputDir) {
    var result = { success: false, path: "", error: "" };

    try {
        app.enableQE();
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) {
            result.error = "No active sequence found.";
            return JSON.stringify(result);
        }

        var outFolder = new Folder(outputDir);
        if (!outFolder.exists) {
            outFolder.create();
        }

        var timecode = "00:00:00:00";
        try {
            timecode = qeSeq.CTI.timecode;
        } catch (ctiErr) {
            var stdSeq = app.project.activeSequence;
            if (stdSeq) {
                timecode = stdSeq.getPlayerPosition().getFormatted(
                    stdSeq.getSettings().videoFrameRate,
                    app.project.activeSequence.videoDisplayFormat
                );
            }
        }

        var safeTime = ("" + timecode).replace(/[:;]/g, "_");
        var exportTimecode = ("" + timecode).replace(/;/g, ":");
        var timestamp = new Date().getTime();
        var baseFileName = "FXConsole_" + safeTime + "_" + timestamp;
        var nativeDir = outFolder.fsName.replace(/\//g, "\\");
        var outputPathNoExt = nativeDir + "\\" + baseFileName;

        try {
            qeSeq.exportFramePNG(exportTimecode, outputPathNoExt);
        } catch (expErr) {
            // Try with 00:00:00:00 if timecode formatting threw
            qeSeq.exportFramePNG("00:00:00:00", outputPathNoExt);
        }

        var possibleFile1 = new File(outputPathNoExt + ".png");
        var possibleFile2 = new File(outputPathNoExt);

        if (possibleFile1.exists) {
            result.success = true;
            result.path = possibleFile1.fsName;
        } else if (possibleFile2.exists) {
            result.success = true;
            result.path = possibleFile2.fsName;
        } else {
            var recentFiles = outFolder.getFiles("FXConsole_" + safeTime + "*.png");
            if (recentFiles && recentFiles.length > 0) {
                result.success = true;
                result.path = recentFiles[recentFiles.length - 1].fsName;
            } else {
                result.error = "Frame export completed, but file not found at: " + outputPathNoExt + ".png";
            }
        }

    } catch (e) {
        result.error = e.toString();
    }

    return JSON.stringify(result);
}

function getSelectedClipsInfo() {
    var clips = [];

    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ clips: [] });

        try {
            var selection = seq.getSelection();
            if (selection && selection.length > 0) {
                for (var i = 0; i < selection.length; i++) {
                    var c = selection[i];
                    clips.push({
                        name: c.name,
                        start: c.start.seconds,
                        end: c.end.seconds,
                        duration: c.duration.seconds
                    });
                }
            }
        } catch (selErr) {}

        if (clips.length === 0) {
            for (var vt = 0; vt < seq.videoTracks.numTracks; vt++) {
                var vTrk = seq.videoTracks[vt];
                for (var vc = 0; vc < vTrk.clips.numItems; vc++) {
                    var vClip = vTrk.clips[vc];
                    try {
                        if (vClip.isSelected && vClip.isSelected()) {
                            clips.push({ name: vClip.name });
                        }
                    } catch (e) {}
                }
            }
        }
    } catch (e) {
        return JSON.stringify({ clips: [] });
    }

    return JSON.stringify({ clips: clips });
}

function getHostInfo() {
    var info = {
        appName: "Premiere Pro",
        appVersion: app.version,
        buildNumber: app.build || "unknown"
    };
    return JSON.stringify(info);
}
