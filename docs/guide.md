# CMDS Eagle user guide
Connect a visual asset library to your notes without confusing the original, the preview, and the published copy.

## Status and prerequisites
This guide covers source version **1.8.4**, checked on **2026-09-14**. Release 1.8.4 contains the three installable plugin files and CMDS Eagle is in the Obsidian Community Plugins registry. Registry listing is not a manual security review; its listing explicitly says it has not been manually reviewed by Obsidian staff.
- Obsidian **desktop 1.6.6+** on a machine that can run Eagle; no mobile plugin support.
- [Eagle](https://eagle.cool) installed, licensed according to Eagle's own terms, running with a library open. The plugin is MIT-licensed; Eagle is separate software.
- Local API normally at `http://localhost:41595`. No cloud account is needed for local search/import.
- Optional cloud account and storage/traffic budget for ImgHippo, R2, S3, WebDAV, or a custom upload service. The plugin does not provision a storage service for you.
- A backed-up test note and one non-sensitive image. Do not begin with a whole-vault migration.

## Install
1. Open Obsidian **Settings → Community plugins → Browse**.
2. Search **CMDS Eagle**, install, and enable it. Review the community-plugin permissions notice first.
3. Open **Settings → CMDS Eagle → Connection → Test Connection** with Eagle running.
For manual installation, download `main.js`, `manifest.json`, and `styles.css` from [release 1.8.4](https://github.com/johnfkoo951/cmds-eagle/releases/tag/1.8.4). Put all three in `<vault>/.obsidian/plugins/cmds-eagle/`, reload Obsidian, and enable the plugin. Do not replace an existing `data.json` with somebody else's configuration.

## First success: one image in one note
1. In Eagle, open a library containing a harmless sample image.
2. In plugin settings choose **Where to store images → Import into Eagle (recommended)**. This is about new pastes/imports, not where an existing searched item lives.
3. Choose **What goes into the note → Photo + info — portable thumbnail** (`photo-info`) for a portable preview. This is a recommendation, not the shipped default: the default is `cmds-eagle`.
4. Open a scratch Markdown note and place the cursor where the image should appear.
5. Open the command palette with Ctrl/Cmd+P and run **Search Eagle library and embed**. Search by a known item name, then choose it.
6. Check the rendered preview, the one-line metadata card, and the **Open in Eagle** link. A thumbnail should be in the vault's configured thumbnail folder.
Success means the image is visible and the link opens the intended Eagle item. Syncing the note and thumbnail can make the preview visible elsewhere; opening `eagle://` still requires a supported Eagle installation and the relevant library.

## Decide storage and link style separately
**Storage** (`Where to store images`) offers Eagle, vault, cloud, or ask. **Link style** (`What goes into the note`) controls the reference inserted for an Eagle item. Changing the default does not migrate every existing note.

| Mode | What the note uses | Copy in vault | Best use / limitation |
|---|---|---|---|
| `photo-info` | Thumbnail linked to Eagle, plus a one-line card | Thumbnail | Portable reading with metadata |
| `photo-only` | Thumbnail linked to Eagle | Thumbnail | Portable, compact reading |
| `link-only` | Eagle deep link | None | Navigation, not an image preview; recipient needs Eagle |
| `cmds-eagle` (default) | Original `file://` embed and metadata card | None | Original quality on a mounted, registered desktop |
| `cmds-eagle-photo-only` | Original `file://` embed | None | Compact original-quality desktop preview |
| `cmds-eagle-photo-link` | Original preview linked to Eagle | None | Click the original preview to open its Eagle item |

A thumbnail is not a backup of the original. Small images without an Eagle thumbnail may use a copied original instead. If an image cannot be resolved within the configured wait, the output falls back to an Eagle deep link rather than a temporary file. Deleting an Eagle original breaks the original-file modes; a previously copied thumbnail may survive, but its Eagle link will no longer resolve.

## Libraries, folders, and search
Search uses the library Eagle **currently has open**. Import destination settings do not make search span every library at once.
- **Detect libraries → Scan Eagle** reads the open library and library history.
- **Target library**: currently open (default), always a specific library, or ask every time. The specific-library mode exposes **Default library**.
- **Target folder**: each library's default, ask every time, or library root. Folder IDs belong to a library; configure them separately.
- The folder picker searches full paths and can create a folder before import. Eagle's API assigns folders during import; re-filing an already imported item is not promised by this control.
- **Switch back after import** restores the previous library when appropriate. A manual library change during import is respected rather than overwritten.
- Removing a remembered library profile also removes its saved default folder, not the Eagle library on disk. A scan may rediscover it.
- **Remove missing libraries on scan** is off by default. A library is marked missing only when absent from both Eagle's history and disk; an unavailable scan is not evidence of deletion.
- Search has name/tag/notes/folder scope and file-type filters. **Items to pre-load for search** defaults to 5000; additional results can come from Eagle keyword search as you type.

## Command reference
Command-palette entries are prefixed by CMDS Eagle. Editor actions need an active Markdown editor.

| Exact command | Use and side effects |
|---|---|
| Search Eagle library and embed | Search the open library and insert the chosen item |
| Switch Eagle library | Change the library open in Eagle |
| Set default Eagle folder for the open library | Save the import folder for that library |
| Upload clipboard Eagle image to cloud | Read an Eagle reference from the clipboard, upload the resolved image, insert a URL |
| Embed Eagle image and upload to cloud | Choose an Eagle item, upload and insert it |
| Convert all images in note to cloud URLs | Upload supported images in the active note and rewrite their links; inspect the resulting note |
| Convert cross-platform image paths in current note | Remap registered roots; source writes depend on Conversion mode |
| Move this note's local images into Eagle | Migrate referenced local images; **can rewrite other notes and trash originals** |
| Move all local images in the vault into Eagle | Vault-wide migration; **destructive, not a first-use action** |
| Verify Eagle references in current note | Report missing files/items; may temporarily switch libraries; does not rewrite the note |

## Settings reference
The visible labels below come from the 1.8.4 settings implementation.

| Section | Important controls |
|---|---|
| Connection | Eagle API Base URL; Connection Timeout (milliseconds); Test Connection |
| Eagle libraries | Target library/folder; Default library when relevant; Switch back after import; Library switch timeout; Scan Eagle; missing-profile removal |
| Image paste/drop behavior | Where to store images; What goes into the note; Thumbnail folder (default `attachments/eagle`); Hidden tag prefixes in card |
| Thumbnail handling | Thumbnail wait timeout (default 10000 ms); Thumbnail size warning (default 2048 KB); Remove staged copy after import |
| Search & embed | Include metadata card; Items to pre-load for search |
| Cloud storage provider | Active Cloud Provider and that provider's credentials/URLs |
| Cross-platform sync | Enable cross-platform path conversion; Conversion mode; Auto-convert paths on file open; Add current computer and library root |
| Excalidraw integration | Embed images in Excalidraw via cloud; Also add pasted screenshots to Eagle |

The staged file under `.eagle-temp/` is removed after the copied Eagle original is confirmed at full size when cleanup is enabled. Disabling that option for debugging leaves additional copies.

## Cloud upload and Excalidraw
Set a provider before using any cloud command; selecting its name alone does not configure credentials.

| Provider | Required setup |
|---|---|
| ImgHippo | Account/API key from the provider; review its retention and service limits |
| Cloudflare R2 | Compatible Worker upload endpoint, Worker API key, public bucket URL; a bucket alone is insufficient |
| Amazon S3 | Endpoint, region, bucket, access key ID and secret; optional public URL |
| WebDAV | Server URL, username/password, upload path, externally readable public URL |
| Custom server | Upload URL and public URL matching the plugin's custom upload contract |

Test using a non-sensitive image, then open the resulting URL in a browser that is not logged in. Upload success does not prove public readability. Charges, access policies, and retention are controlled by the chosen service.
Excalidraw integration requires that separate plugin and a configured cloud provider. Eagle assets resolve to originals; screenshots can be uploaded and optionally also imported into Eagle. The drawing then depends on externally reachable image URLs. These uploads are not encrypted by CMDS Eagle.

## Cross-device reading
Path conversion is a root mapping, **not Eagle-library synchronization**. On each desktop use **Add current computer** and enter the actual mounted library root. Local volumes, mapped Windows drives, and UNC network shares can be represented.
**Render only** is the default conversion mode: it changes displayed paths without editing the Markdown. **Modify note source** rewrites file URLs and skips unmounted targets. Prefer render-only when several computers sync the same notes. Phones cannot mount a desktop `file://` library through this plugin; use synced thumbnails or accessible cloud images for reading there.

## Migration: read before running
Back up both the vault and Eagle library and pause competing edits first. The per-note migration chooses images from one note, but **rewrites references to those images across other Markdown notes too**. Successful imports/references are processed before the vault originals are trashed according to Obsidian's deletion preference. Select system trash in Obsidian if that is the intended destination.
Generated thumbnails, temporary staging files, and unreferenced assets are excluded. Failure preserves the affected original, but earlier successful operations are **not automatically rolled back**. Inspect the reported touched files and failures. Restore from your backup deliberately, without overwriting newer edits. Migration is not performed by installing the plugin or reading this guide.

## Privacy and limitations
- Local search talks to Eagle's local API; explicit imports write to Eagle and selected vault locations. Cloud actions send image bytes and associated request data to the configured service.
- Treat `data.json`, storage keys, library paths, and diagnostic output as private. A masked field is not proof of encrypted-at-rest storage.
- Public image URLs can be forwarded or cached. Removing a note link does not guarantee deletion of its cloud asset.
- `file://` and `eagle://` links are not public web image URLs. A Share page cannot make a recipient's machine mount your library.
- Desktop source support is not a clean-machine test on every OS. This documentation pass inspected source and public release metadata; it did not execute imports, migrations, or provider uploads.

## Troubleshooting

| Symptom | Check next |
|---|---|
| Connection fails | Start Eagle, open a library, verify the local API URL and timeout, then Test Connection |
| Known item missing | Confirm the open library; clear scope/type filters; search the exact name; check pre-load limit and API keyword results |
| Only an Eagle link appears | Thumbnail/original could not be resolved; check file availability and thumbnail wait, not a guessed temp path |
| Image still appears after deletion | Reload the Obsidian window and run Verify Eagle references; cached rendering can be stale |
| Missing on another computer | Mount the library, register that computer/root, or use photo-info for a synced preview |
| Cloud upload succeeds but image fails | Verify public URL/access policy separately from upload credentials |
| Removed library reappears | Eagle still remembers it; profile removal does not remove Eagle's history or disk data |
| Migration partly completes | Stop further bulk runs; inspect notices/console and backups; successful prior edits remain |

## Updates, support, and credits
Back up configuration before upgrading; use Community Plugins updates or the matching three files from one release, then retest one note. Keep release versions together.
[Product and web manual](https://apps.cmdspace.work/plugins/cmds-eagle/) | [Releases](https://github.com/johnfkoo951/cmds-eagle/releases) | [Issues](https://github.com/johnfkoo951/cmds-eagle/issues).
When reporting a problem, include plugin/Obsidian/Eagle versions, OS, link mode, provider type, and a sanitized reproduction. Never attach credentials, a private library, or full plugin settings.
**Yohan Koo (CMDSPACE)**, https://cmdspace.work. MIT; see [LICENSE](https://github.com/johnfkoo951/cmds-eagle/blob/main/LICENSE).

## Source and verification reference
Behavior was checked against `manifest.json`, `src/main.ts`, `src/settings.ts`, `src/types.ts`, `src/canonical.ts`, `src/api.ts`, and `src/cloud-providers.ts`. [Source repository](https://github.com/johnfkoo951/cmds-eagle). Existing screenshot below shows the storage-choice interaction, not every current 1.8.4 setting; reviewed for visible private content.
![Existing Eagle storage-choice screenshot](https://raw.githubusercontent.com/johnfkoo951/cmds-eagle/main/assets/CMDS-eagle3.png)

## Appendix: preserved release history
The following records the earlier README release notes (1.8.0–1.8.4). Historical wording is retained; the current workflow and limitations above take precedence.
### What's new in 1.8.4
**A renamed or deleted library stayed in the list for good.** Detection only ever added profiles, so a
library you renamed in Eagle kept its old entry in settings — pointing at a path that no longer exists,
with no way to remove it. Every library row now has a remove button, and a library Eagle has forgotten
that is also gone from disk is marked `Missing` with a `Remove all missing` action above the list.

Removal stays deliberate by default, because a profile holds your saved default folder. A library is
only called missing when **both** signals agree: Eagle no longer lists it *and* the bundle is gone from
disk. An external or network volume that is merely unmounted is still remembered by Eagle, so it stays
listed and keeps its settings. When Eagle is not running nothing is judged at all. Turn on
`Remove missing libraries on scan` if you would rather have `Scan Eagle` clean up on its own.

### What's new in 1.8.2
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

### What's new in 1.8.0
#### Multiple Eagle libraries
Eagle opens one library at a time, so importing into another one means switching Eagle to it and
switching back — about a second each way. Set this up under **Settings → Eagle libraries**:

| Target library | Behaviour |
|---|---|
| Currently open library (default) | Never switches. Identical to 1.7.x. |
| Always a specific library | Switches to it when needed, then restores if `Switch back after import` is enabled. |
| Ask every time | Prompts, so one note can hold assets from several libraries. |

If you switch libraries in Eagle yourself while an import is running, your choice wins — the plugin
checks before restoring and leaves Eagle where you put it.

#### Per-library folders
Imports can land in a folder rather than the library root. Folder ids belong to their library, so each
library remembers its own default folder. **Target folder** can also be set to *Ask every time*, which
opens a picker that searches full paths (`proj/jazz` finds `Projects/Jazz Blend`) and can create a
folder inline — type `Inbox/2026` to create `2026` under `Inbox`.

Eagle assigns folders at import time only: its API cannot move an item between folders afterwards. So
the target is chosen up front, and re-filing means re-importing.

#### Capture and link modes
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

#### Link modes
Two independent settings: **where the file is stored** (Eagle / vault / cloud / ask) and **what goes into
the note**. The second one is `linkMode`:

| mode | note contains | vault copies | other devices |
|---|---|---|---|
| **`photo-info`** | thumbnail + one-line card | 1 thumbnail | Yes |
| `photo-only` | thumbnail | 1 thumbnail | Yes |
| `link-only` | `eagle://` link | none | Yes |
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
[Cross-platform sync](#cross-device-reading) for sharing one library across desktops. The portable
photo modes degrade to a plain `eagle://` link when their thumbnail is unavailable. The original modes
do the same when the original cannot be resolved — never to a temp-file reference.
In `cmds-eagle-photo-link`, clicking the rendered original opens that exact item in Eagle.

The `photo-*` output shape is covered by contract tests — see `src/canonical.ts` and
`tests/canonical.test.ts`. Keep them in sync when changing the rendered form.

#### Moving an existing vault over
`Move all local images in the vault into Eagle` imports every referenced image, rewrites all references
to the canonical form, and sends the vault copy to the trash. `Move this note's local images into Eagle`
selects images from one note — try that first. References to those images in other notes are also
rewritten. Both ask for confirmation and report what they touched. The vault-wide operation is
destructive and can be slow on large vaults; back up first. To send originals to the system trash,
select that option in Obsidian: the plugin follows Obsidian's deletion setting.
