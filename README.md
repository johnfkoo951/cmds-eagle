# CMDS Eagle

Obsidian plugin to connect [Eagle](https://eagle.cool) asset library with your vault.

## What's New

Pasting into Eagle previously left a copy in the vault as well, and the reference that was inserted did
not survive a resync or a move to a second machine. This version changes three things:

| | Before | Now |
|---|---|---|
| Staged copy under `.eagle-temp/` | written on every paste, never deleted — the original ends up in both Eagle and the vault | removed once Eagle confirms the import |
| Inserted path | absolute `file://` into the Eagle library — breaks when a cloud mount reconnects, on other devices, and when the library is dehydrated | vault-relative thumbnail + `eagle://` deep link |
| Thumbnail wait | hardcoded `delay(1000)`; large files fall back to a link to the temp file, which is then orphaned | exponential-backoff polling, then a deep link — never a machine-local path |

### Link modes

Two independent settings: **where the file is stored** (Eagle / vault / cloud / ask) and **what goes into
the note**. The second one is `linkMode`:

| mode | note contains | vault copies | other devices |
|---|---|---|---|
| **`photo-info`** (default) | thumbnail + one-line card | 1 thumbnail | ✅ |
| `photo-only` | thumbnail | 1 thumbnail | ✅ |
| `link-only` | `eagle://` link | none | ✅ |
| `cmds-eagle` | absolute `file://` embed + card | none | registered desktops only |
| `cmds-eagle-photo-only` | absolute `file://` embed | none | registered desktops only |
| `cmds-eagle-photo-link` | original image linked to its `eagle://` item | none | registered desktops only |

```markdown
# photo-info
[![hero shot](attachments/eagle/KXYZ01.png)](eagle://item/KXYZ01)
> `png` · 4.2 MB · 1920×1080 · #ui #ref · [Eagle에서 열기](eagle://item/KXYZ01)

# photo-only
[![hero shot](attachments/eagle/KXYZ01.png)](eagle://item/KXYZ01)

# link-only
[hero shot](eagle://item/KXYZ01)

# cmds-eagle
![hero shot](file:///Volumes/…/My%20Library.library/images/KXYZ01.info/hero%20shot.png)
> `png` · 4.2 MB · 1920×1080 · #ui #ref · [Eagle에서 열기](eagle://item/KXYZ01)

# cmds-eagle-photo-only
![hero shot](file:///Volumes/…/My%20Library.library/images/KXYZ01.info/hero%20shot.png)

# cmds-eagle-photo-link
[![hero shot](file:///Volumes/…/My%20Library.library/images/KXYZ01.info/hero%20shot.png)](eagle://item/KXYZ01)
```

The thumbnail is keyed by Eagle item id (so renames and re-inserts are idempotent), the image path is
relative to the note (so the whole vault syncs), and the card is exactly one line. The `cmds-eagle*`
modes embed the original itself, so they need the library to be mounted — see
[Cross-platform sync](#cross-platform-sync) for sharing one library across desktops. The portable
photo modes degrade to a plain `eagle://` link when their thumbnail is unavailable. The original modes
do the same when the original cannot be resolved — never to a temp-file reference.
In `cmds-eagle-photo-link`, clicking the rendered original opens that exact item in Eagle.

The `photo-*` output shape is covered by contract tests — see `src/canonical.ts` and
`tests/canonical.test.ts`. Keep them in sync when changing the rendered form.

### Moving an existing vault over

`Move all local images in the vault into Eagle` imports every referenced image, rewrites all references
to the canonical form, and sends the vault copy to the trash. `Move this note's local images into Eagle`
does the same for one note — try that first. Both ask for confirmation and report what they touched.

## Features

- **Search & Embed**: Search Eagle library and embed images directly into notes
- **Cloud Upload**: Upload images to cloud storage (ImgHippo, Cloudflare R2, Amazon S3, WebDAV)
- **Paste/Drop Integration**: Automatically handle pasted or dropped images
- **Batch Convert**: Convert all local images in a note to cloud URLs
- **Cross-Platform Sync**: Automatically convert image paths between Mac and Windows
- **Excalidraw Integration**: Paste or drop images onto an Excalidraw canvas — Eagle assets embed the original, and clipboard screenshots are uploaded to your cloud provider (and optionally added to your Eagle library) instead of bloating the vault with attachments

## Installation

### From Community Plugins (Recommended)

1. Open **Settings → Community plugins** in Obsidian
2. Click **Browse** and search for **CMDS Eagle**
3. Click **Install**, then **Enable**

### Manual Installation

1. Download `main.js`, `manifest.json`, `styles.css` from [Releases](https://github.com/johnfkoo951/cmds-eagle/releases)
2. Create folder: `.obsidian/plugins/cmds-eagle/`
3. Copy downloaded files into the folder
4. Enable plugin in Obsidian settings

### Development Build

```bash
npm install --legacy-peer-deps   # upstream pins typescript 4.7.4, which typescript-eslint rejects
npm run build
npm test                          # canonical-form contract tests
```

Then copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/cmds-eagle/`
and enable the plugin in Obsidian settings.

## Requirements

- [Eagle](https://eagle.cool) app running locally
- Obsidian 1.5.0+

## Usage

### Search & Embed

Search your Eagle library and embed images directly into notes.

![Search and Embed](assets/CMDS-eagle1.gif)



### Image Paste/Drop

When pasting or dropping images, choose where to save them.

![Search Modal](assets/CMDS-eagle2.gif)
![Search Results](assets/CMDS-eagle3.png)


### Cloud Upload

Upload images to cloud storage for sharing and portability.

![Cloud Upload](assets/CMDS-eagle5.gif)
![Paste Options](assets/CMDS-eagle4.gif)

### Cross-platform sync

Only relevant to the `cmds-eagle*` modes, which embed the original by absolute path. Register the
absolute path each computer mounts the library at, and those paths are remapped for whichever
machine is reading the note.

![Cross-Platform Sync](assets/CMDS-eagle-cross-platform.gif)

**How it works:**
1. On each computer, choose **Add current computer**. The plugin matches the local profile from the
   running OS and login username, so a synced Windows selection cannot become current on macOS.
2. Enter that machine's library root — any absolute path:
   | | example |
   |---|---|
   | macOS | `/Volumes/Assets/My Library.library` |
   | Windows drive | `Z:\My Library.library` |
   | Windows UNC | `\\NAS\Assets\My Library.library` |
3. Paths are remapped by swapping one root for the other

The root is not required to sit under a home directory, so a library on a NAS works — each machine
just registers its own mount point. A UNC root survives drive-letter reassignment; `Z:` does not.

**Settings:**
- `Enable cross-platform path conversion` — turn the feature on
- `Conversion mode` — `Render only` (default) remaps images as they are displayed and never writes to
  the note, so two machines sharing a synced vault cannot conflict. `Modify note source` rewrites the
  note, and skips any path whose target is not currently mounted.
- `Auto-convert paths on file open`

**Manual conversion:** command `Convert cross-platform image paths in current note`

**Limits.** `file://` cannot reach a NAS from iOS or Android — mobile cannot mount the share. Notes
that must render on a phone need `photo-info` (vault thumbnail) instead. On desktop the library must
be mounted when the note is opened.

### Excalidraw

Paste or drop images directly onto an Excalidraw canvas and let Eagle handle them:

- **Eagle assets** (copied/dragged from Eagle) resolve to the **original** image (not the thumbnail).
- **Clipboard screenshots** are uploaded to your active cloud provider and embedded by URL — and, when enabled, added to your Eagle library.
- Images are embedded as portable cloud URLs, keeping the `.excalidraw` file small instead of storing vault attachments.

Requires the [Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin) plugin and a configured cloud provider. Toggle it under **Settings → Excalidraw integration**.

## Settings

Configure your preferred cloud provider and search defaults.


![Settings](assets/CMDS-eagle6.png)

## Cloud Providers

| Provider | Setup |
|----------|-------|
| **ImgHippo** (Free) | Sign up at [imghippo.com](https://imghippo.com), get API key from [settings](https://www.imghippo.com/settings) |
| **Cloudflare R2** | Requires Worker deployment (see docs) |
| **Amazon S3** | Standard S3 credentials |
| **WebDAV** | Works with Synology, Nextcloud, etc. |

![Cloud Settings](assets/CMDS-eagle7.png)

## Commands

| Command | Description |
|---------|-------------|
| `Search Eagle library and embed` | Open search modal |
| `Upload clipboard Eagle image to cloud` | Upload from clipboard |
| `Embed Eagle image and upload to cloud` | Embed + upload in one step |
| `Convert all images in note to cloud URLs` | Batch convert local images |
| `Convert cross-platform image paths in current note` | Convert Mac/Windows paths |
| `Move this note's local images into Eagle` | Import this note's images, rewrite references, trash the vault copies |
| `Move all local images in the vault into Eagle` | Same, across the whole vault |
| `Verify Eagle links in current note` | Report `eagle://` links whose item no longer exists |

## License

MIT
