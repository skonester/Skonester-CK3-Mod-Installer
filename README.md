# CK3 Mod Installer

Install and manage mod ZIP files for **Crusader Kings III 1.19**. This is version **1.20.1** of the installer. You need your own copy of CK3 and the mods you want to use.

## Get started

1. Download the build for your system from [Releases](https://github.com/skonester/Skonester-CK3-Mod-Installer/releases) and open the app.
2. Drag a CK3 mod ZIP into the window, or click **Choose ZIP Archive**.
3. Check the mod name and other details. The app fills these in when the ZIP contains a `descriptor.mod` file; you can edit them before installing.
4. Click **AUTO-DETECT** to find your CK3 **mods folder**. If that does not find it, click **BROWSE FOLDER** and choose the mods folder yourself. This is the folder for your mods, not the folder containing the CK3 game.
5. Click **INSTALL & LOAD MOD**. If the mod does not appear in game, check that it is enabled in your CK3 playset.

The app has an **Installed Mods** tab for viewing and removing mods and a **Conflicts** tab that shows files shared by multiple installed mods. A shared file is worth checking; it does not always mean the mods are incompatible.

## Launching CK3

The **Launch CK3 (Steam)** button opens CK3 through Steam if you use Steam.

**Heroic is optional.** If you prefer Heroic, install [Heroic Games Launcher](https://heroicgameslauncher.com/) separately and click **Launch CK3 (Heroic)**. CK3 must already be installed and accessible on your computer. The installer looks for the game on Windows, Linux, or macOS, adds it to Heroic as an Added Game when needed, and asks Heroic to launch it. You do not need Steam installed to use this button. A full drive search can take a while; the app shows its progress.

The Heroic button launches the CK3 game executable. To manage a playset, open the Paradox launcher separately if your setup uses it.

## Compatibility

- **Game version:** Crusader Kings III 1.19. Individual mods also need to support the CK3 version you are playing.
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
