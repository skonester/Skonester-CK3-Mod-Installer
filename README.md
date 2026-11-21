# CK3 Mod Installer

[![Downloads](https://img.shields.io/github/downloads/skonester/Skonester-CK3-Mod-Installer/total.svg)](https://github.com/skonester/Skonester-CK3-Mod-Installer/releases)

Install and manage mod ZIP files for **Crusader Kings III 1.21 (Florin)**. This is version **1.21.0** of the installer. You need your own copy of CK3 and the mods you want to use.

## Get started

1. Download the build for your system from [Releases](https://github.com/skonester/Skonester-CK3-Mod-Installer/releases) and open the app.
2. Drag a CK3 mod ZIP into the window, or click **Choose ZIP**.
3. Review the mod details. The app reads them from the archive's descriptor and uses `1.21.*` when the descriptor has no supported version. You can edit the details before installing.
4. Check **Install location**. Use **Auto-detect** to find your CK3 mods folder or **Browse folder** to select it.
5. Click **Install mod**, then enable the installed mod in your Paradox Launcher playset.

The app has an **Installed Mods** tab for viewing and removing mods and a **Conflicts** tab that shows files shared by multiple installed mods. A shared file is worth checking; it does not always mean the mods are incompatible.

## Launching CK3

The **Launch via Steam** button opens CK3 through Steam if you use Steam.

**Heroic is optional.** If you prefer Heroic, install [Heroic Games Launcher](https://heroicgameslauncher.com/) separately and click **Launch via Heroic**. CK3 must already be installed and accessible on your computer. The installer looks for the game on Windows, Linux, or macOS, adds it to Heroic as an Added Game when needed, and asks Heroic to launch it. You do not need Steam installed to use this button. A full drive search can take a while and the app shows its progress.

The Heroic button launches the CK3 game executable. To manage a playset, open the Paradox launcher separately if your setup uses it.

## Compatibility

- **Game version:** Crusader Kings III 1.21 (Florin). Individual mods also need to support the CK3 version you are playing.
- **Systems:** Windows, Linux, and macOS. Download the build for your system from Releases.
- **Mod format:** ZIP archives. The app can read mod details from a `descriptor.mod` file in the archive.

## Build from source

Players using a release download do not need Node.js. To run or build the source, install Node.js 20 or later, then:

```bash
git clone https://github.com/skonester/Skonester-CK3-Mod-Installer.git
cd Skonester-CK3-Mod-Installer
npm install
npm start
```

Build a package on the matching operating system:

```bash
npm run dist:win
npm run dist:linux
npm run dist:mac
```

## License

CK3 Mod Installer is licensed under the [GNU General Public License version 3](LICENSE) (`GPL-3.0-only`). The project's earlier Boost Software License notice is retained in [NOTICE](NOTICE).
