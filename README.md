# Skonester CK3 Mod Installer

[![Downloads](https://img.shields.io/github/downloads/skonester/Skonester-CK3-Mod-Installer/total.svg)](https://github.com/skonester/Skonester-CK3-Mod-Installer/releases)

A universal, automated modification installer for Crusader Kings III (Optimized for v1.19 "Scribe").

[App Preview](https://htmlpreview.github.io/?https://github.com/skonester/Skonester-CK3-Mod-Installer/blob/main/index.html)

---

## Features

* **Zero-Config:** Auto-detects the standard mod directory (`Documents/Paradox Interactive/Crusader Kings III/mod`).
* **Drag & Drop:** Supports direct UI input for ZIP, RAR, and 7Z archives.
* **Auto-Slotting Logic:** Installs to the next available directory slot (`mod1/`, `mod2/`, etc.) to prevent filename conflicts.
* **Source Agnostic:** Compatible with archives from Nexus, Paradox Mods, or external repositories.
* **Portable Deployment:** Operates as a single executable (EXE) on Windows. No system installation required.

---

## Stack

* **Electron v40**
* **Node.js v20+**
* **yauzl-promise** (Advanced ZIP management)

---

## Local Development

To modify or build the application locally, ensure **Node.js v20+** is installed on the host machine.

```bash
# Setup & Run
git clone [https://github.com/skonester/Skonester-CK3-Mod-Installer.git](https://github.com/skonester/Skonester-CK3-Mod-Installer.git)
cd Skonester-CK3-Mod-Installer
npm install
npm start

# Compile Binaries
npm run dist:win    # Windows
npm run dist:linux  # Linux
npm run dist:mac    # MacOS (Experimental)


Cloud Building (GitHub Actions)
Actions are disabled by default on forks. To compile standalone binaries via the cloud:

Enable Workflows: In your repository fork, navigate to the Actions tab and select "I understand my workflows, go ahead and enable them".

Trigger the Build: Pushing to the main branch triggers an automatic build. To manually execute, navigate to Actions > Multi-Platform Build & Release > Run workflow.

Download Artifacts: Once the build completes (green checkmark), click the specific run name, scroll to the Artifacts section, and download your target platform binary (e.g., build-windows-latest).