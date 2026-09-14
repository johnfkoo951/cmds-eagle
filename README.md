[![English](https://img.shields.io/badge/English-README-134538)](README.md) [![한국어](https://img.shields.io/badge/한국어-README-E985A2)](README.ko.md)

# CMDS Eagle
Bring Eagle assets into your notes, with an explicit choice between local originals, portable previews, and cloud URLs.

**Version 1.8.4 | Available in Community Plugins.**

Obsidian 1.6.6+ | Desktop only.

![CMDS Eagle storage choice](assets/CMDS-eagle3.png)
Choose where an image is stored. Earlier UI shown; current labels may differ.

## What it does
- Search the open Eagle library and embed an image with its metadata.
- Import pasted/dropped images into a chosen Eagle library and folder.
- Choose six link modes independently of the image storage destination.
- Upload through configured cloud providers or map original-file paths across desktops.

## Install and first use
**Community:** Settings → Community plugins → Browse → **CMDS Eagle** → Install → Enable.

**Manual:** Download `main.js`, `manifest.json`, and `styles.css` from [release 1.8.4](https://github.com/johnfkoo951/cmds-eagle/releases/tag/1.8.4), place them in `<vault>/.obsidian/plugins/cmds-eagle/`, reload Obsidian, and enable. Back up existing settings; do not copy another user’s `data.json`.

Open Eagle, test the connection in settings, choose `photo-info` for a portable preview, then run **Search Eagle library and embed** in a sample note.

## Read the manual
- [English user guide](docs/guide.md)
- [한국어 사용설명서](docs/guide.ko.md)
- [Web manual](https://apps.cmdspace.work/plugins/cmds-eagle/)
- [Product family](https://apps.cmdspace.work/plugins/)
- [Issues and support](https://github.com/johnfkoo951/cmds-eagle/issues)

## Privacy and limits
Eagle is a separately licensed desktop application. Local search needs no cloud account. Cloud uploads disclose image bytes to your provider. Migration commands can rewrite other notes and trash vault originals: back up first.

## Development
```sh
npm install
npm run build
```
Build the plugin assets for local development.
[Preserved release history](docs/guide.md#appendix-preserved-release-history) is in the manual.

## Credits and license
**Yohan Koo (CMDSPACE)**, https://cmdspace.work. **MIT**, [LICENSE](LICENSE).
