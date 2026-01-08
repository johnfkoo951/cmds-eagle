# CMDS Eagle

Obsidian plugin to connect [Eagle](https://eagle.cool) asset library with your vault.

![Search and Embed](assets/CMDS-eagle1.gif)

## Features

- **Search & Embed**: Search Eagle library and embed images directly into notes
- **Cloud Upload**: Upload images to cloud storage (ImgHippo, Cloudflare R2, Amazon S3, WebDAV)
- **Paste/Drop Integration**: Automatically handle pasted or dropped images
- **Batch Convert**: Convert all local images in a note to cloud URLs

## Installation

### Using BRAT (Recommended)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. Open BRAT settings → Add Beta Plugin
3. Enter: `johnfkoo951/cmds-eagle`
4. Enable the plugin

### Manual Installation

1. Download `main.js`, `manifest.json`, `styles.css` from [Releases](https://github.com/johnfkoo951/cmds-eagle/releases)
2. Create folder: `.obsidian/plugins/cmds-eagle/`
3. Copy downloaded files into the folder
4. Enable plugin in Obsidian settings

## Requirements

- [Eagle](https://eagle.cool) app running locally
- Obsidian 1.5.0+

## Usage

### Search & Embed

Search your Eagle library and embed images directly into notes.

![Search Modal](assets/CMDS-eagle2.gif)

![Search Results](assets/CMDS-eagle3.png)

### Image Paste/Drop

When pasting or dropping images, choose where to save them.

![Paste Options](assets/CMDS-eagle4.gif)

### Cloud Upload

Upload images to cloud storage for sharing and portability.

![Cloud Upload](assets/CMDS-eagle5.gif)

## Settings

Configure your preferred cloud provider and search defaults.

![Settings](assets/CMDS-eagle6.png)

![Cloud Settings](assets/CMDS-eagle7.png)

## Cloud Providers

| Provider | Setup |
|----------|-------|
| **ImgHippo** (Free) | Sign up at [imghippo.com](https://imghippo.com), get API key from [settings](https://www.imghippo.com/settings) |
| **Cloudflare R2** | Requires Worker deployment (see docs) |
| **Amazon S3** | Standard S3 credentials |
| **WebDAV** | Works with Synology, Nextcloud, etc. |

## Commands

| Command | Description |
|---------|-------------|
| `Search Eagle library and embed` | Open search modal |
| `Upload clipboard Eagle image to cloud` | Upload from clipboard |
| `Embed Eagle image and upload to cloud` | Embed + upload in one step |
| `Convert all images in note to cloud URLs` | Batch convert local images |

## License

MIT
