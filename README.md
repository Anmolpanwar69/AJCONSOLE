# ⚡ AJ Console for Premiere Pro

A powerful workflow plugin for **Adobe Premiere Pro** inspired by Video Copilot's legendary FX Console for After Effects. Instantly search and apply effects, manage favorites, capture frame screenshots, and create custom aliases — all from a lightning-fast interface.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![Premiere Pro](https://img.shields.io/badge/Premiere%20Pro-2020%2B-9999FF)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **⚡ Instant Effect Search** | Fuzzy search across all video effects, audio effects, video transitions, and audio transitions |
| **⭐ Favorite Slots (1–9)** | Assign your 9 most-used effects for instant one-key application |
| **🏷️ Custom Aliases** | Create short keywords (e.g., `lum` → Lumetri Color, `diss` → Cross Dissolve) |
| **📸 Frame Capture** | Instant screenshot of the current frame at playhead — save to disk or clipboard |
| **🖼️ Snapshot Gallery** | Built-in gallery with pin, label, delete, and copy-to-clipboard actions |
| **🎯 Ctrl+Space Overlay** | Floating spotlight launcher (via Electron overlay app + native low-level hook) |
| **🎨 Dark Theme** | Native Premiere Pro dark theme with glass-morphism effects |
| **🔌 IPC Bridge** | CEP panel runs an HTTP server for overlay communication |
| **⚠️ Diagnostics & Logs** | Built-in error inspector and self-testing diagnostic engine |

---

## 📦 Project Structure

```
FX Console/
├── com.fxconsole.premiere/       ← CEP Extension (runs inside Premiere Pro)
│   ├── CSXS/
│   │   └── manifest.xml          ← Extension manifest
│   ├── client/
│   │   ├── index.html            ← Main panel UI
│   │   ├── css/
│   │   │   └── style.css         ← Dark theme stylesheet
│   │   └── js/
│   │       ├── CSInterface.js    ← Adobe CEP bridge library
│   │       ├── main.js           ← Main application controller
│   │       ├── search.js         ← Fuzzy search engine
│   │       ├── favorites.js      ← Favorites manager (slots 1–9)
│   │       ├── gallery.js        ← Screenshot gallery manager
│   │       └── aliases.js        ← Custom alias manager
│   ├── host/
│   │   └── index.jsx             ← ExtendScript backend (Premiere Pro API)
│   └── .debug                    ← Debug configuration
│
├── overlay/                      ← Electron Overlay App (Ctrl+Space launcher)
│   ├── package.json
│   ├── main.js                   ← Electron main process (hotkey, window)
│   ├── preload.js                ← Secure IPC bridge
│   └── renderer/
│       ├── index.html            ← Overlay HUD UI
│       ├── style.css             ← Glass-morphism styling
│       └── app.js                ← Overlay app logic
│
├── install.bat                   ← One-click installer
└── README.md
```

---

## 🚀 1-Click Installation & Distribution

### Option 1: Standalone Single-File Installer (Send to Anyone!)
👉 **`AJConsole-Setup.exe`** (~98 MB)
- **100% Self-Contained**: The entire Adobe extension, Electron runtime, and native keyboard hook are embedded inside this single `.exe`.
- **Zero Dependencies**: Does not require Node.js, Git, or any accompanying files/folders. You can email or share just this one file.
- **Premiere-Only Smart Lifecycle**: `Ctrl + Space` triggers **only** when Adobe Premiere Pro is the active window, and the background service automatically shuts down when Premiere Pro is closed.
- **How to use**:
  1. Double-click **`AJConsole-Setup.exe`**.
  2. Click **"⚡ Install AJ Console"** (or run with `/silent` for silent install).
  3. Open Premiere Pro → **Window → Extensions → AJ Console** once.
  4. Press **`Ctrl + Space`** anywhere in Premiere Pro!

### Option 2: Lightweight Setup Runner (Local Workspace)
👉 **`AJConsole-Installer.exe`** / **`install.bat`**
- Uses directory junctions to install directly from the local development workspace into `%APPDATA%\Adobe\CEP\extensions`.

---

## 🎮 Usage

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + F` | Focus search bar |
| `1` – `9` | Apply favorite effect (when search is empty) |
| `↑` / `↓` | Navigate results |
| `Enter` | Apply selected effect to timeline selection |
| `Esc` | Clear search / close overlay |
| `F5` | Capture current frame |
| `Shift + F5` | Capture frame & copy to clipboard |
| `Ctrl + G` | Switch to Gallery view |
| `Ctrl + ,` | Open Settings |
| `Ctrl + Space` | Open overlay launcher (requires overlay app) |

### Searching

- **Direct search**: Type any part of the effect name (e.g., `blur`, `color`, `dissolve`)
- **Fuzzy matching**: Characters match in order (e.g., `gb` → **G**aussian **B**lur)
- **Word-initial matching**: First letters of each word (e.g., `lc` → **L**umetri **C**olor)
- **Aliases**: Use shortcuts (e.g., `lum` → Lumetri Color)

### Built-in Aliases

| Alias | Effect |
|-------|--------|
| `lum`, `lumetri`, `color`, `grade` | Lumetri Color |
| `blur`, `gblur`, `gauss` | Gaussian Blur |
| `warp`, `stab`, `stabilize` | Warp Stabilizer |
| `crop` | Crop |
| `diss`, `dissolve`, `xdiss` | Cross Dissolve |
| `morph`, `mc` | Morph Cut |
| `ultra`, `chroma`, `green`, `key` | Ultra Key |
| `fade`, `xfade`, `cp` | Constant Power |
| `eq` | Parametric Equalizer |

See **Settings → Custom Aliases** for the full list and to add your own.

### Filter Chips

Click filter chips to narrow results:
- **All** — Everything
- **Video FX** — Video effects only
- **Audio FX** — Audio effects only
- **Video Trans** — Video transitions only
- **Audio Trans** — Audio transitions only

---

## 🏗️ Architecture

```
┌─────────────────────────┐      HTTP (localhost:39471)      ┌──────────────────────┐
│   Electron Overlay      │◄────────────────────────────────►│  CEP Extension       │
│   (Ctrl+Space HUD)      │                                  │  (Panel in Premiere) │
│                          │                                  │                      │
│  ┌──────────────────┐   │                                  │  ┌────────────────┐  │
│  │ Renderer (HTML)  │   │                                  │  │  HTML/JS UI    │  │
│  │ - Search box     │   │                                  │  │  - Search      │  │
│  │ - Results list   │   │         evalScript()             │  │  - Favorites   │  │
│  │ - Favorites      │   │                                  │  │  - Gallery     │  │
│  └────────┬─────────┘   │                                  │  │  - Settings    │  │
│           │ IPC          │                                  │  └───────┬────────┘  │
│  ┌────────┴─────────┐   │                                  │          │            │
│  │  Main Process    │   │                                  │  ┌───────┴────────┐  │
│  │  - Global hotkey │   │                                  │  │  ExtendScript  │  │
│  │  - Window mgmt   │   │                                  │  │  (host/index)  │  │
│  └──────────────────┘   │                                  │  │  - QE DOM      │  │
│                          │                                  │  │  - Effects API │  │
└─────────────────────────┘                                  │  │  - Frame cap   │  │
                                                             │  └────────────────┘  │
                                                             └──────────┬───────────┘
                                                                        │
                                                             ┌──────────┴───────────┐
                                                             │   Premiere Pro       │
                                                             │   (Host Application) │
                                                             └──────────────────────┘
```

---

## 🔧 Development

### Debug the CEP Panel

1. With the extension loaded in Premiere Pro, open Chrome and navigate to:
   ```
   http://localhost:8098
   ```
2. You'll see Chrome DevTools for the CEP panel.

### Debug the Overlay

```bash
cd overlay
npm run dev
```
This launches Electron with DevTools open.

### Rebuilding Effects Index

Click **Settings → 🔄 Refresh Effects List** in the panel to re-scan all effects from Premiere Pro.

---

## ⚠️ Requirements

- **Adobe Premiere Pro** 2020 (v14.0) or later
- **Windows 10/11** (macOS support planned)
- **Node.js 18+** (for the Electron overlay)

---

## 📝 License

MIT License — Free for personal and commercial use.

---

## 🙏 Credits

**Created & Developed by:** [Anmol Panwar](https://github.com/Anmolpanwar69)

**Inspired by:** [Video Copilot's FX Console](https://www.videocopilot.net/blog/2016/10/new-workflow-plug-in-fx-console-is-now-available/) for Adobe After Effects.

AJConsole is an independently developed project designed to bring a fast, intuitive, and streamlined effects workflow to Adobe Premiere Pro.

This project is not officially affiliated with Adobe or Video Copilot.
---

<p align="center">
  <strong>⚡ FX Console — Your effects, instantly.</strong>
</p>
