[🇬🇧 English](README.md) · [🇰🇷 한국어](README.ko.md)

# CMDS Eagle

Obsidian plugin to connect [Eagle](https://eagle.cool) asset library with your vault.

## What's new in 1.8.4

**A renamed or deleted library stayed in the list for good.** Detection only ever added profiles, so a
library you renamed in Eagle kept its old entry in settings — pointing at a path that no longer exists,
with no way to remove it. Every library row now has a remove button, and a library Eagle has forgotten
that is also gone from disk is marked `Missing` with a `Remove all missing` action above the list.

Removal stays deliberate by default, because a profile holds your saved default folder. A library is
only called missing when **both** signals agree: Eagle no longer lists it *and* the bundle is gone from
disk. An external or network volume that is merely unmounted is still remembered by Eagle, so it stays
listed and keeps its settings. When Eagle is not running nothing is judged at all. Turn on
`Remove missing libraries on scan` if you would rather have `Scan Eagle` clean up on its own.

## What's new in 1.8.2

**Search saw only a fraction of your library.** Eagle returns 200 items when no limit is given, and the
search modal never gave one — so on a 2,400-item library it fuzzy-matched against 8% of it and
everything else behaved as though it did not exist. The modal now pre-loads `Items to pre-load for
search` (default 5000) and, beyond that cap, merges in Eagle's own keyword search as you type, so no
item is unreachable regardless of library size.

**The search filters were never drawn.** The scope filters (`Name` / `Tags` / `Notes` / `Folders`), the
file-type filters and the library item-count header had all been silently missing, because the code that
inserts them looked for the wrong element. They now render.

**Attachments no longer break at the vault root.** With Obsidian's *Default location for new attachments*
left at `Vault folder`, saving an image locally produced a `//name.png` path that Obsidian could not
resolve. Reported and fixed by [@nancyel](https://github.com/nancyel) in
[#1](https://github.com/johnfkoo951/cmds-eagle/pull/1), then extended to the neighbouring cases.

## What's new in 1.8.0

### Multiple Eagle libraries

Eagle opens one library at a time, so importing into another one means switching Eagle to it and
switching back — about a second each way. Set this up under **Settings → Eagle libraries**:

| Target library | Behaviour |
|---|---|
| Currently open library (default) | Never switches. Identical to 1.7.x. |
| Always a specific library | Switches to it when needed, then restores if `Switch back after import` is enabled. |
| Ask every time | Prompts, so one note can hold assets from several libraries. |

If you switch libraries in Eagle yourself while an import is running, your choice wins — the plugin
checks before restoring and leaves Eagle where you put it.

### Per-library folders

Imports can land in a folder rather than the library root. Folder ids belong to their library, so each
library remembers its own default folder. **Target folder** can also be set to *Ask every time*, which
opens a picker that searches full paths (`proj/jazz` finds `Projects/Jazz Blend`) and can create a
folder inline — type `Inbox/2026` to create `2026` under `Inbox`.

Eagle assigns folders at import time only: its API cannot move an item between folders afterwards. So
the target is chosen up front, and re-filing means re-importing.

### Capture and link modes

Pasting into Eagle previously left a copy in the vault as well, and the reference that was inserted did
not survive a resync or a move to a second machine. This version changes three things:

| | Before | Now |
|---|---|---|
| Staged copy under `.eagle-temp/` | written on every paste, never deleted — the original ends up in both Eagle and the vault | removed once Eagle confirms the import |
| Inserted path | absolute `file://` into the Eagle library, with no alternative | still the default (`cmds-eagle`), but `photo-info` now offers a vault-relative thumbnail + `eagle://` deep link that survives a resync and renders on other devices |
| Thumbnail wait | hardcoded `delay(1000)`; large files fall back to a link to the temp file, which is then orphaned | exponential-backoff polling, then a deep link — never a machine-local path |

Existing installs keep their current behaviour: `linkMode` defaults to `cmds-eagle`, so nothing changes
until you pick another mode.

> **Deleting in Eagle removes the image from your notes.** That is the intent of the `cmds-eagle`
> modes — Eagle is the source of truth. Be aware that the image may keep rendering for a while after
> deletion: Obsidian serves it from memory until the window reloads. Run
> `Verify Eagle references in current note` to see the real state. Choose `photo-info` instead if you
> want notes to survive deletions in Eagle.

### Link modes

Two independent settings: **where the file is stored** (Eagle / vault / cloud / ask) and **what goes into
the note**. The second one is `linkMode`:

| mode | note contains | vault copies | other devices |
|---|---|---|---|
| **`photo-info`** | thumbnail + one-line card | 1 thumbnail | ✅ |
| `photo-only` | thumbnail | 1 thumbnail | ✅ |
| `link-only` | `eagle://` link | none | ✅ |
| **`cmds-eagle`** (default) | absolute `file://` embed + card | none | registered desktops only |
| `cmds-eagle-photo-only` | absolute `file://` embed | none | registered desktops only |
| `cmds-eagle-photo-link` | original image linked to its `eagle://` item | none | registered desktops only |

```markdown
# photo-info
[![hero shot](attachments/eagle/KXYZ01.png)](eagle://item/KXYZ01)
> `png` · 4.2 MB · 1920×1080 · #ui #ref · [Open in Eagle](eagle://item/KXYZ01)

# photo-only
[![hero shot](attachments/eagle/KXYZ01.png)](eagle://item/KXYZ01)

# link-only
[hero shot](eagle://item/KXYZ01)

```

For the three `cmds-eagle*` modes, the table describes the equivalent output using the original
image rather than a vault thumbnail; machine-specific file locations are omitted from these examples.

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
selects images from one note — try that first. References to those images in other notes are also
rewritten. Both ask for confirmation and report what they touched. The vault-wide operation is
destructive and can be slow on large vaults; back up first. To send originals to the system trash,
select that option in Obsidian: the plugin follows Obsidian's deletion setting.

## Features

- **Search & Embed**: Search Eagle library and embed images directly into notes
- **Multiple libraries**: Import into any known Eagle library — fixed, or chosen per import
- **Folder targeting**: Send imports to a per-library default folder, or pick (or create) one each time
- **Cloud Upload**: Upload images to cloud storage (ImgHippo, Cloudflare R2, Amazon S3, WebDAV)
- **Paste/Drop Integration**: Automatically handle pasted or dropped images
- **Batch Convert**: Convert all local images in a note to cloud URLs
- **Cross-Platform Sync**: Automatically convert image paths between Mac and Windows
- **Excalidraw Integration**: Paste or drop images onto an Excalidraw canvas — Eagle assets embed the original, and clipboard screenshots are uploaded to your cloud provider (and optionally added to your Eagle library) instead of bloating the vault with attachments

## Installation

### From community plugins (recommended)

1. Open **Settings → Community plugins** in Obsidian
2. Click **Browse** and search for **CMDS Eagle**
3. Click **Install**, then **Enable**

### Manual installation

1. Download `main.js`, `manifest.json`, `styles.css` from [Releases](https://github.com/johnfkoo951/cmds-eagle/releases)
2. Create folder: `.obsidian/plugins/cmds-eagle/`
3. Copy downloaded files into the folder
4. Enable plugin in Obsidian settings

### Development build

```bash
npm install --legacy-peer-deps   # upstream pins typescript 4.7.4, which typescript-eslint rejects
npm run build
npm test                          # canonical-form contract tests
```

Then copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/cmds-eagle/`
and enable the plugin in Obsidian settings.

## Requirements

- [Eagle](https://eagle.cool) app running locally
- Obsidian 1.6.6+

## Usage

### Search and embed

Search your Eagle library and embed images directly into notes.

![Search and Embed](assets/CMDS-eagle1.gif)



### Image paste/drop

When pasting or dropping images, choose where to save them.

![Search Modal](assets/CMDS-eagle2.gif)
![Search Results](assets/CMDS-eagle3.png)


### Cloud upload

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
2. Enter that machine's absolute library root:
   | Platform | Supported location |
   |---|---|
   | macOS | A local volume or mounted network share |
   | Windows drive | A local or mapped drive |
   | Windows UNC | A network share addressed directly by its UNC root |
3. Paths are remapped by swapping one root for the other

The root is not required to sit under a home directory, so a library on a NAS works — each machine
just registers its own mount point. A UNC root survives drive-letter reassignment; a mapped drive root does not.

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

### Eagle libraries

Use **Settings → Eagle libraries** to choose where imports go. These settings control imports;
search still uses the library Eagle currently has open.

| Setting or button | Behaviour |
|---|---|
| `Target library` | `Currently open library` (default) never switches; `Always a specific library` uses the selected `Default library`; `Ask every time` prompts from known libraries. |
| `Default library` | Appears when `Always a specific library` is selected. Choose a detected library. |
| `Target folder` | `Each library's default folder` uses that library's saved folder; `Ask every time` opens a folder picker with creation support; `Library root` imports without a folder. |
| `Switch back after import` | When enabled, restores the previously open library after importing into another library. Disable it to leave the target open. |
| `Library switch timeout` | Maximum wait for a switch, in milliseconds; minimum 1000. A switch normally takes about one second. |
| `Scan Eagle` | Under `Detect libraries`, reads Eagle's known library history and the open library, adding profiles without overwriting saved default folders. It also re-checks which stored libraries still exist, marking the gone ones `Missing`. |
| `Remove missing libraries on scan` | Off by default. When on, `Scan Eagle` removes libraries Eagle no longer lists that are also absent from disk, along with their saved default folder. When off they stay, marked `Missing`, for you to remove. |
| `Items to pre-load for search` | How many items the search modal loads up front (default 5000). Past this, typing falls back to Eagle's own keyword search. Eagle's own default of 200 is too low for most libraries. |

Folder ids are per-library: set defaults separately, using the library controls or
`Set default Eagle folder for the open library`. If no default is set, imports use the library root;
an unavailable saved folder also falls back to the root with a notice. Scan first if the library list is empty.

Each library row carries a remove button that drops it from the list along with its saved default folder.
Removing the library selected as `Default library` clears that selection. A removed library comes back on
the next scan if Eagle still knows it, so removal is only permanent for a library that is really gone.

Importing into a non-open library switches Eagle and, with `Switch back after import` enabled,
switches back afterwards — approximately one second each way. If you switch to another library
in Eagle yourself mid-import, the restoration check respects your choice rather than switching back.

Below that, configure your preferred cloud provider and search defaults.


![Settings](assets/CMDS-eagle6.png)

## Cloud providers

| Provider | Setup |
|----------|-------|
| **ImgHippo** (Free) | Sign up at [imghippo.com](https://imghippo.com), get API key from [settings](https://www.imghippo.com/settings) |
| **Cloudflare R2** | Requires Worker deployment (see docs) |
| **Amazon S3** | Standard S3 credentials |
| **WebDAV** | Works with Synology, Nextcloud, etc. |

![Cloud Settings](assets/CMDS-eagle7.png)

## Commands

Run these commands from Obsidian's command palette. Names below match the registered commands;
all three cloud commands use the active cloud provider configured in settings.

### Search Eagle library and embed

`search-eagle` opens a fuzzy search modal over the **open library**, with search scope filters
`Name`, `Tags`, `Notes`, and `Folders`, and file type filters `Images`, `Videos`, `Docs`, and `All`.
Use it to find an existing asset and insert it into the active note in the shape specified by `linkMode`.
It does not search every known library or switch to the import target; open the intended library first.

### Switch Eagle library

`switch-eagle-library` opens a library picker so you can change the library Eagle has open from inside
the vault. Use it before searching a different collection; it changes Eagle's open library, not note content
or the configured import target. Eagle opens one library at a time, must be running, and keeps the
selected library open after this command; if none are known, the plugin attempts detection first.

### Set default Eagle folder for the open library

`set-eagle-default-folder` lets you pick or create the default folder for imports into the open library.
Use it to route future imports without choosing a folder each time; it saves that library's default,
without moving existing items or changing note content. Folder ids are per-library, and the saved
choice applies when `Target folder` is `Each library's default folder`, not `Ask every time` or `Library root`.

### Upload clipboard Eagle image to cloud

`upload-clipboard-to-cloud` reads an Eagle item link, Eagle localhost URL, or Eagle library file location
from the clipboard and uploads the original through the active cloud provider. Use it to share an
existing Eagle image: a successful new upload inserts a Markdown image in the active editor, copies
the public URL to the clipboard, and updates Eagle upload tags when an item is resolved.
It expects a text reference, not raw screenshot bytes; item lookup uses the open library.
If the item is already recognised as uploaded, it copies the existing URL instead of inserting a new embed.

### Embed Eagle image and upload to cloud

`embed-and-upload` uploads the Eagle image referenced by clipboard text through the active cloud
provider and inserts a Markdown image using the returned public URL. Use it to embed and upload
in one step; when an item is resolved and an upload key is returned, it also records upload tags in Eagle.
It requires a supported Eagle text reference and an accessible original, not a raw screenshot,
and does not copy the resulting URL to the clipboard or skip an already uploaded item.

### Convert all images in note to cloud URLs

`convert-all-to-cloud` uploads recognised local Markdown image embeds in the current note through
the active cloud provider and replaces successfully uploaded URLs in the note source.
Use it to make an existing note more portable; it handles file URLs, Eagle localhost thumbnail URLs
(uploading their originals), and supported relative image links, but not wiki-style embeds or arbitrary web images.
It leaves original files in place and reports an uploaded/total count; failed uploads keep their old references.
The command starts without a confirmation dialogue, so check the note and provider before running it.

### Convert cross-platform image paths in current note

`convert-cross-platform-paths` remaps image paths between machines using the computer profiles
in settings; use it when opening a synced note on another desktop.
With `Conversion mode` set to `Render only` (default), it changes displayed images without writing
the note; `Modify note source` rewrites the note's file URLs and skips targets that are not mounted.
Enable `Enable cross-platform path conversion` and register the current computer first; this does
not copy or synchronise the Eagle library itself.

### Move this note's local images into Eagle

`migrate-note-images-to-eagle` asks for confirmation, imports supported vault images embedded in
the current note into the configured Eagle target, and rewrites every reference it finds to those images
across the vault using `linkMode` before trashing each vault original.
Use it as a small trial before vault-wide migration; other notes sharing the same images can also change.
Generated Eagle thumbnails and temporary staging files are excluded, and a failed import or rewrite
leaves the vault original in place, although earlier successful changes are not rolled back.
The confirmation describes system trash, but the implementation uses Obsidian's deletion preference:
select system trash in Obsidian to send the copies there rather than to the vault trash.

### Move all local images in the vault into Eagle

`migrate-vault-images-to-eagle` asks for confirmation and scans Markdown notes for supported embedded
vault images, imports them into the configured Eagle target, rewrites every reference it finds, and
trashes the vault copies after successful rewriting.
Use it for a full migration, but **this is destructive and can be slow on large vaults: back up and run
`Move this note's local images into Eagle` first**.
Unreferenced files, generated Eagle thumbnails, and temporary staging files are not migration targets;
the batch uses one target-library session and reports successes and failures rather than rolling back.
As with the per-note command, choose system trash in Obsidian's deletion settings if that is where
the removed copies should go.

### Verify Eagle references in current note

`verify-eagle-links` reports references whose **file is missing on disk** or whose **item is gone from
Eagle**, checking across every library identifiable from the note's references, plus the open library
for deep links without a library location. Use it after deleting or moving assets: a deleted image can
keep rendering until the Obsidian window reloads because it is served from memory, so this command
is the reliable way to check the true state rather than trusting the displayed image.
It reports notices and console details without rewriting the note, but may temporarily switch libraries.
If Eagle is not running, only disk files are checked; unavailable libraries or deep links whose library
cannot be identified can prevent item verification, so a reported unresolved item is not proof of deletion.

## Author

**Yohan Koo (CMDSPACE)** — https://cmdspace.work

## License

MIT
