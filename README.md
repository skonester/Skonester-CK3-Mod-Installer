# Skonester CK3 Mod Installer

[![Downloads](https://img.shields.io/github/downloads/skonester/Skonester-CK3-Mod-Installer/total.svg)](https://github.com/skonester/Skonester-CK3-Mod-Installer/releases)

A universal, automated modification installer for Crusader Kings III.

[App Preview](https://htmlpreview.github.io/?https://github.com/skonester/Skonester-CK3-Mod-Installer/blob/main/index.html)

---

## Features

* **Zero-Config Detection:** Auto-detects the standard mod folder (`Documents/Paradox Interactive/Crusader Kings III/mod`).
* **Interface Input:** Supports Drag & Drop (ZIP, RAR, 7Z) directly into the window, or traditional manual selection.
* **Auto-Slotting Logic:** Installs modifications to the next available directory slot automatically (`mod1/`, `mod2/`, etc.) to prevent filename conflicts.
* **Source Agnostic:** Compatible with modification archives downloaded from Nexus, Paradox Mods, or external repositories.
* **Portable:** Deploys as a single executable (EXE) on Windows. No system installation is required.
* **Game Compatible:** Optimized for Crusader Kings III version 1.19 "Scribe".

---

## Built With

* **Electron v40**
* **yauzl-promise** (Advanced ZIP management)
* **Node.js v20+**

---

## Cloud Building (GitHub Actions)

GitHub Actions are disabled by default on forked repositories. You must enable them manually before executing cloud builds.

### Step 1: Enable Workflows
1. Fork this repository to your GitHub account.
2. Navigate to your fork and select the **Actions** tab.
3. Select **"I understand my workflows, go ahead and enable them"**.

### Step 2: Trigger Build
The build workflow executes automatically upon pushing code to the `main` branch. To trigger it manually:
1. Open the **Actions** tab.
2. Select the **Multi-Platform Build & Release** workflow on the left sidebar.
3. Click the **Run workflow** dropdown on the right and confirm.

### Step 3: Download Binaries
1. Upon build completion (indicated by a green checkmark), click the specific run name.
2. Scroll down to the **Artifacts** section.
3. Select the target platform artifact (e.g., `build-windows-latest`) to download the compiled standalone binary.

---

## Local Developer Instructions

To modify or build the application locally, ensure **Node.js v20+** is installed on the host machine.

### Prerequisites

```bash
git clone [https://github.com/skonester/Skonester-CK3-Mod-Installer.git](https://github.com/skonester/Skonester-CK3-Mod-Installer.git)
cd Skonester-CK3-Mod-Installer
npm install
npm start

Windows build: npm run dist:win

Linux build: npm run dist:linux

Mac Experimental: npm run dist:mac


## Cloud Building (GitHub Actions - Required for Forks)

GitHub Actions are disabled by default on forked repositories. You must enable them manually before you can build.

### Step 1: Enable Workflows

1.  **Fork** this repository to your account.
2.  Navigate to your fork on GitHub and click the **Actions** tab.
3.  Click the green button: **"I understand my workflows, go ahead and enable them"**.

### Step 2: Trigger Build

The build will now run automatically when you push code to `main`. To trigger it manually:

1.  Stay in the **Actions** tab.
2.  Select the **Multi-Platform Build & Release** workflow on the left.
3.  Click the **Run workflow** dropdown on the right and confirm.

### Step 3: Download Binaries

1.  Once the build finishes (green checkmark), click the run name (e.g., "Build: 1.19.0 deployment manifest").
2.  Scroll down to the **Artifacts** section.
3.  Click an artifact (e.g., `build-windows-latest`) to download the ZIP file containing your compiled standalone binary.