# AGENTS.md - CMDS Eagle

> Obsidian plugin for Eagle asset library integration with cloud upload support.

## Quick Reference

```bash
# Development (watch mode)
npm run dev

# Production build (type-check + bundle)
npm run build

# Version bump (updates manifest.json + versions.json)
npm run version
```

## Project Structure

```
src/
├── main.ts          # Plugin entry point, commands, event handlers
├── types.ts         # All interfaces, types, constants
├── api.ts           # Eagle API service + URL utilities
├── modals.ts        # UI modals (search, folder select, paste choice)
├── settings.ts      # Settings tab UI
└── cloud-providers.ts # Cloud upload providers (R2, S3, WebDAV, ImgHippo)
```

## Build System

- **Bundler**: esbuild (not Webpack/Rollup)
- **Entry**: `src/main.ts` → `main.js`
- **Format**: CommonJS (required by Obsidian)
- **Target**: ES2018
- **External**: obsidian, electron, @codemirror/*, @lezer/*, node builtins

## TypeScript Configuration

```json
{
  "noImplicitAny": true,
  "strictNullChecks": true,
  "module": "ESNext",
  "target": "ES6",
  "moduleResolution": "node"
}
```

## Code Style Guidelines

### Imports

```typescript
// 1. Obsidian imports (destructured, from 'obsidian')
import { Plugin, Notice, Editor, TFile } from 'obsidian';

// 2. Node.js imports
import { promises as fs } from 'fs';

// 3. Local imports (explicit relative paths)
import { EagleItem, CMDSPACEEagleSettings } from './types';
import { EagleApiService, parseEagleUrl } from './api';
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `CMDSPACELinkEagle`, `EagleApiService` |
| Interfaces | PascalCase | `EagleItem`, `CloudUploadResult` |
| Methods/Variables | camelCase | `loadSettings`, `thumbnailPath` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_SETTINGS`, `SUPPORTED_IMAGE_EXTENSIONS` |
| CSS Classes | kebab-case with prefix | `cmdspace-eagle-suggestion` |
| Plugin IDs | kebab-case | `cmds-eagle` |

### Type Definitions

```typescript
// Interfaces for all data structures
export interface EagleItem {
  id: string;
  name: string;
  tags: string[];
  // ...
}

// Union types for enums (not TypeScript enum)
export type CloudProviderType = 'r2' | 's3' | 'webdav' | 'imghippo' | 'custom';
export type ImagePasteBehavior = 'eagle' | 'local' | 'cloud' | 'ask';

// Readonly arrays for constants
export const SUPPORTED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', ...] as const;
```

### Error Handling

```typescript
// Pattern 1: Return null on failure
async getItemInfo(id: string): Promise<EagleItem | null> {
  try {
    const response = await this.get<EagleItem>(`/api/item/info?id=${id}`);
    return response.data ?? null;
  } catch {
    return null;
  }
}

// Pattern 2: Return result object
async upload(filePath: string): Promise<CloudUploadResult> {
  try {
    // ...
    return { success: true, publicUrl: url };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Pattern 3: User notification
try {
  await this.doSomething();
} catch (error) {
  console.error('Failed to do something:', error);
  new Notice('Failed to do something. Check console for details.');
}
```

### Async/Await Patterns

```typescript
// Always use async/await (not .then())
async onload(): Promise<void> {
  await this.loadSettings();
  this.api = new EagleApiService(this.settings);
}

// Chain independent operations with await
const [connected, libraryName] = await Promise.all([
  this.api.isConnected(),
  this.api.getLibraryName()
]);
```

### Class Structure

```typescript
export default class CMDSPACELinkEagle extends Plugin {
  // 1. Properties
  settings: CMDSPACEEagleSettings;
  api: EagleApiService;

  // 2. Lifecycle methods
  async onload(): Promise<void> { }
  onunload(): void { }

  // 3. Public methods
  async loadSettings(): Promise<void> { }
  async saveSettings(): Promise<void> { }

  // 4. Private methods (group by feature)
  private async insertItemLink(editor: Editor, item: EagleItem): Promise<void> { }
  private buildMetadataCard(item: EagleItem): string { }
  
  // 5. Utility methods at bottom
  private formatFileSize(bytes: number): string { }
  private normalizeTag(tag: string): string { }
}
```

### Obsidian Plugin Patterns

```typescript
// Command registration
this.addCommand({
  id: 'search-eagle',
  name: 'Search Eagle library and embed',
  editorCallback: (editor: Editor, view: MarkdownView) => {
    new EagleSearchModal(this.app, this.api, this.settings).open();
  },
});

// Event registration
this.registerEvent(
  this.app.workspace.on('editor-paste', async (evt: ClipboardEvent, editor: Editor) => {
    await this.handlePaste(evt, editor);
  })
);

// Settings persistence
async loadSettings(): Promise<void> {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
}
```

### Modal Patterns

```typescript
// Extend FuzzySuggestModal for searchable lists
export class EagleSearchModal extends FuzzySuggestModal<EagleItem> {
  getItems(): EagleItem[] { return this.allItems; }
  getItemText(item: EagleItem): string { return item.name; }
  onChooseItem(item: EagleItem): void { this.insertItemLink(item); }
}

// Extend Modal for custom dialogs
export class ImagePasteChoiceModal extends Modal {
  onOpen(): void { /* build UI */ }
  onClose(): void { /* resolve promise */ }
  getResponse(): Promise<ImagePasteChoiceResponse> { }
}
```

## CSS Guidelines

```css
/* Use Obsidian CSS variables for theming */
.cmdspace-eagle-suggestion-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.cmdspace-eagle-filter-btn.is-active {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}

/* Prefix all classes with cmdspace-eagle- */
.cmdspace-eagle-tag { }
.cmdspace-eagle-filter-row { }
```

## Important Files

| File | Purpose |
|------|---------|
| `manifest.json` | Plugin metadata, version, minAppVersion |
| `versions.json` | Version compatibility mapping |
| `styles.css` | Plugin CSS (loaded automatically) |
| `main.js` | Bundled output (committed for releases) |

## Testing Checklist

1. Eagle app must be running locally
2. Test with various image types (jpg, png, gif, webp, heic)
3. Test cloud providers with valid credentials
4. Verify clipboard operations work cross-platform

## Common Gotchas

- `requestUrl` from Obsidian bypasses CORS (use instead of fetch for external APIs)
- File paths must be absolute for Eagle API (`addFromPath`)
- Eagle API returns `status: 'success'` not HTTP status codes
- Obsidian vault adapter doesn't support all Node.js fs operations
- Use `promises as fs from 'fs'` for actual file system access
