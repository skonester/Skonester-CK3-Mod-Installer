# Skonester CK3 Mod Loader & Installer

[![Downloads](https://img.shields.io/github/downloads/skonester/Skonester-CK3-Mod-Installer/total.svg)](https://github.com/skonester/Skonester-CK3-Mod-Installer/releases)

A universal, automated modification loader and installer for Crusader Kings III (Optimized for v1.20).

[App Preview](https://htmlpreview.github.io/?https://github.com/skonester/Skonester-CK3-Mod-Installer/blob/main/index.html)

---

## Features

* **In-Memory ZIP Descriptor Auto-Detection:** Automatically extracts and parses `descriptor.mod` from dropped or selected mod ZIPs to auto-populate mod name, version, supported CK3 version, tags, and Steam ID.
* **Paradox Clausewitz Script Engine:** Built-in Clausewitz parser and serializer generating authentic Paradox `.mod` descriptor files.
* **Installed Mods Dashboard:** Browse, search, and manage installed mods; check target folder validity; and open mod directories directly in File Explorer.
* **Mod Conflict Checker:** Scans installed mods for file collisions and highlights overlapping file overrides across mods.
* **Steam Quick Launch:** One-click shortcut to launch Crusader Kings III directly via Steam (`steam://run/1158310`).
* **Multi-Platform Path Auto-Discovery:** Seamlessly discovers CK3 mod directories across Windows (including OneDrive redirected folders), macOS, and Linux / Steam Deck.
* **Portable Deployment:** Operates as a single executable (EXE) on Windows. No system installation required.

---

## Stack

* **Electron v41**
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