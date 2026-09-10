import {
	Plugin,
	MarkdownView,
	Notice,
	Editor,
	TFile,
	Menu,
	EditorPosition,
	TAbstractFile,
	Platform,
} from 'obsidian';
import { userInfo } from 'os';
import {
	CMDSPACEEagleSettings,
	DEFAULT_SETTINGS,
	EagleItem,
	ComputerProfile,
	EagleLibraryProfile,
	FlatEagleFolder,
	PlatformType,
	SUPPORTED_IMAGE_EXTENSIONS,
} from './types';
import {
	flattenFolders,
	libraryNameFromPath,
	libraryProfileFor,
	normalizeLibraryPath,
	parseEagleReferences,
	groupReferencesByLibrary,
	resolveDefaultFolder,
	upsertLibraryProfile,
} from './eagle-library';
import {
	buildCanonicalEmbed,
	modeNeedsThumbnail,
	modeUsesOriginalFile,
	toNoteRelativePath,
} from './canonical';
import { copyThumbnailToVault, pollThumbnailPath } from './vault-assets';
import { pollEagleItemInfo, pollEagleOriginalPath } from './eagle-item-poll';
import {
	extractPathFromImageSrc,
	fileUrlToPath,
	findCurrentComputer,
	pathToFileUrl,
	pathToResourceUrl,
	remapPathToComputer,
	safeDecodeUri,
} from './platform-paths';
import { processRenderedImageMutations } from './rendered-images';
import { resolveAttachmentPath } from './attachment-path';
import { fsp } from './fs-utils';
import { 
	EagleApiService, 
	buildEagleItemUrl, 
	parseEagleUrl, 
	hasR2Upload,
	parseEagleLocalhostUrl,
	isEagleLocalhostUrl,
} from './api';
import {
	ConfirmActionModal,
	EagleFolderModal,
	EagleLibraryModal,
	EagleSearchModal,
	ImagePasteChoiceModal,
	type FolderChoice,
} from './modals';
import { CMDSPACEEagleSettingTab } from './settings';
import { createCloudProvider, getMimeType, getExtFromFilename, CloudProvider } from './cloud-providers';

// Minimal shape of the Excalidraw plugin's view that we drive.
// (The Excalidraw plugin is an optional peer, so we don't import its types.)
interface ExcalidrawViewLike {
	containerEl: HTMLElement;
	addImageWithURL(url: string): Promise<unknown>;
}

/** Where pasted bytes are staged before Eagle imports them. */
const TEMP_DIR = '.eagle-temp';

/**
 * A staged file tracked by both paths: the absolute one Eagle needs to import it,
 * and the vault-relative one the adapter needs to delete it afterwards.
 */
interface TempFileHandle {
	absolutePath: string;
	vaultPath: string;
}

export default class CMDSPACELinkEagle extends Plugin {
	settings: CMDSPACEEagleSettings;
	api: EagleApiService;
	private lastModifiedFile: string | null = null;
	private attachedExcalidrawContainers = new WeakSet<HTMLElement>();

	async onload(): Promise<void> {
		console.log('[CMDS Eagle] Loading plugin v1.6.0');

		await this.loadSettings();
		this.api = new EagleApiService(this.settings);

		this.addCommand({
			id: 'search-eagle',
			name: 'Search Eagle library and embed',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.openSearchModal();
			},
		});

		this.addCommand({
			id: 'switch-eagle-library',
			name: 'Switch Eagle library',
			callback: async () => {
				await this.switchLibraryCommand();
			},
		});

		this.addCommand({
			id: 'set-eagle-default-folder',
			name: 'Set default Eagle folder for the open library',
			callback: async () => {
				const active = await this.api.getActiveLibrary();
				if (!active) {
					new Notice('Eagle is not running');
					return;
				}
				await this.profileForActiveLibrary();
				await this.setDefaultFolderForLibrary(active.path);
			},
		});

		this.addCommand({
			id: 'upload-clipboard-to-cloud',
			name: 'Upload clipboard Eagle image to cloud',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				await this.uploadClipboardToCloud(editor);
			},
		});

		this.addCommand({
			id: 'embed-and-upload',
			name: 'Embed Eagle image and upload to cloud',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				await this.embedAndUploadToCloud(editor);
			},
		});

		this.addCommand({
			id: 'convert-all-to-cloud',
			name: 'Convert all images in note to cloud URLs',
			callback: async () => {
				await this.uploadAllImagesToCloud();
			},
		});

		this.addCommand({
			id: 'convert-cross-platform-paths',
			name: 'Convert cross-platform image paths in current note',
			callback: async () => {
				if (this.settings.crossPlatformConversionMode === 'render-only') {
					this.convertCrossPlatformRenderOnly();
					return;
				}
				await this.convertCrossPlatformPaths();
			},
		});

		this.addCommand({
			id: 'migrate-note-images-to-eagle',
			name: 'Move this note\'s local images into Eagle',
			callback: async () => {
				await this.migrateLocalImagesToEagle('note');
			},
		});

		this.addCommand({
			id: 'migrate-vault-images-to-eagle',
			name: 'Move all local images in the vault into Eagle',
			callback: async () => {
				await this.migrateLocalImagesToEagle('vault');
			},
		});

		this.addCommand({
			id: 'verify-eagle-links',
			name: 'Verify Eagle references in current note',
			callback: async () => {
				await this.verifyEagleLinks();
			},
		});



		this.registerEvent(
			this.app.workspace.on('editor-paste', (evt: ClipboardEvent, editor: Editor) => {
				if (evt.defaultPrevented) return;
				if (!this.willHandlePaste(evt)) return;
				evt.preventDefault();
				void this.handlePaste(evt, editor);
			})
		);

		this.registerEvent(
			this.app.workspace.on('editor-drop', (evt: DragEvent, editor: Editor) => {
				if (evt.defaultPrevented) return;
				if (!this.willHandleDrop(evt)) return;
				evt.preventDefault();
				void this.handleDrop(evt, editor);
			})
		);

		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor) => {
				const localImage = this.getLocalImageUnderCursor(editor);
				if (localImage) {
					menu.addItem((item) => {
						item.setTitle('Upload to Eagle')
							.setIcon('upload')
							.onClick(() => this.uploadLocalImageToEagle(editor, localImage));
					});
				}
			})
		);

		this.addSettingTab(new CMDSPACEEagleSettingTab(this.app, this));

		this.registerMarkdownPostProcessor((el, ctx) => {
			this.processEagleLinks(el);
			this.processFileUrls(el);
		});
		this.observeRenderedImages();

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				window.setTimeout(() => this.processActiveView(), 100);
			})
		);

		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				window.setTimeout(() => this.processActiveView(), 100);
			})
		);

		this.registerEvent(
			this.app.vault.on('modify', (file: TAbstractFile) => {
				this.lastModifiedFile = file.path;
			})
		);

		this.registerEvent(
			this.app.workspace.on('file-open', (file: TFile | null) => {
				console.log(`[CMDS Eagle] file-open event: ${file?.path}`);
				console.log(`[CMDS Eagle] enableCrossPlatform: ${this.settings.enableCrossPlatform}`);
				console.log(`[CMDS Eagle] autoConvertCrossPlatformPaths: ${this.settings.autoConvertCrossPlatformPaths}`);
				console.log(`[CMDS Eagle] conversionMode: ${this.settings.crossPlatformConversionMode}`);
				console.log(`[CMDS Eagle] lastModifiedFile: ${this.lastModifiedFile}`);
				
				if (file && this.settings.enableCrossPlatform && this.settings.autoConvertCrossPlatformPaths) {
					if (this.settings.crossPlatformConversionMode === 'render-only') {
						// Rendering never edits the note, so a recent vault modification
						// must not suppress conversion of Live Preview images.
						window.setTimeout(() => this.autoConvertRenderOnlyOnFileOpen(), 300);
					} else if (this.lastModifiedFile !== file.path) {
						console.log(`[CMDS Eagle] Triggering auto-conversion for: ${file.path}`);
						window.setTimeout(() => { void this.autoConvertOnFileOpen(file); }, 300);
					} else {
						console.log(`[CMDS Eagle] Skipping - file was just modified by us`);
					}
				}
				this.lastModifiedFile = null;
			})
		);

		this.addRibbonIcon('image', 'CMDSPACE: Eagle', () => {
			this.openSearchModal();
		});

		this.registerExcalidrawIntegration();
	}

	onunload(): void {
		console.log('[CMDS Eagle] Unloading plugin');
	}

	async loadSettings(): Promise<void> {
		const saved = (await this.loadData()) as Partial<CMDSPACEEagleSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
		await this.migrateLinkMode(saved);
	}

	/**
	 * A pre-release build of this fork split storage and note format into a single
	 * `captureMode`. They are separate concerns, so storage went back to the
	 * upstream `imagePasteBehavior` and the note format became `linkMode`.
	 * Convert once, then drop the old keys so they cannot drift back into effect.
	 */
	private async migrateLinkMode(saved: Partial<CMDSPACEEagleSettings> | null): Promise<void> {
		const legacy = saved?.captureMode;
		if (!legacy) return;

		if (legacy === 'eagle-thumbnail' || legacy === 'eagle-original-link') {
			this.settings.imagePasteBehavior = 'eagle';
			this.settings.linkMode = legacy === 'eagle-original-link'
				? 'cmds-eagle'
				: (saved?.insertMetadataCard === false ? 'photo-only' : 'photo-info');
		} else {
			this.settings.imagePasteBehavior = legacy;
		}

		delete this.settings.captureMode;
		delete this.settings.insertMetadataCard;
		await this.saveSettings();
		console.log(`[CMDS Eagle] Migrated captureMode="${legacy}" to imagePasteBehavior="${this.settings.imagePasteBehavior}" + linkMode="${this.settings.linkMode}"`);
	}

	// ---------------------------------------------------------------------------
	// Import targeting: which library, and which folder inside it.
	//
	// Eagle opens one library at a time, so targeting another one means switching
	// to it and switching back — see EagleApiService.switchLibrary for the timing
	// facts. Folder ids are library-scoped, so every library carries its own
	// default folder in its EagleLibraryProfile.
	// ---------------------------------------------------------------------------

	/** Flattened folder tree of the library that is open right now. */
	private async getFlatFolders(): Promise<FlatEagleFolder[]> {
		return flattenFolders(await this.api.listFolders());
	}

	/**
	 * The profile for the open library, creating one on first sight. Also absorbs
	 * the pre-1.8 single `defaultFolder` setting, which had no UI and so was only
	 * ever set by hand — it belongs to whichever library was open at the time.
	 */
	private async profileForActiveLibrary(): Promise<EagleLibraryProfile | null> {
		const active = await this.api.getActiveLibrary();
		if (!active) return null;

		let profile = libraryProfileFor(this.settings.libraries, active.path);
		if (!profile) {
			profile = {
				path: active.path,
				name: active.name || libraryNameFromPath(active.path),
				defaultFolderId: this.settings.defaultFolder || '',
				defaultFolderPath: '',
			};
			this.settings.libraries = upsertLibraryProfile(this.settings.libraries, profile);
			if (this.settings.defaultFolder) {
				this.settings.defaultFolder = '';
			}
			await this.saveSettings();
		}
		return profile;
	}

	/**
	 * The folder id an import should use for `profile`, repairing the stored id
	 * when the folder was deleted and re-created under the same path.
	 */
	private async resolveFolderForProfile(profile: EagleLibraryProfile): Promise<string | undefined> {
		if (!profile.defaultFolderId && !profile.defaultFolderPath) return undefined;

		const resolved = resolveDefaultFolder(await this.getFlatFolders(), profile);
		if (!resolved) {
			new Notice(
				`Eagle folder "${profile.defaultFolderPath || profile.defaultFolderId}" no longer exists in ${profile.name} — importing to the library root`
			);
			return undefined;
		}

		if (resolved.repaired) {
			this.settings.libraries = upsertLibraryProfile(this.settings.libraries, {
				...profile,
				defaultFolderId: resolved.id,
				defaultFolderPath: resolved.path,
			});
			await this.saveSettings();
		}
		return resolved.id || undefined;
	}

	/**
	 * Obsidian's SuggestModal runs `close()` BEFORE `onChooseSuggestion()`:
	 *
	 *   selectSuggestion(e, t) { …, this.close(), this.isOpen = false, this.onChooseSuggestion(e, t) }
	 *
	 * So the dismissal path must yield a tick before reporting "cancelled",
	 * otherwise it fires first and cancels every successful selection.
	 */
	private promptForFolder(folders: FlatEagleFolder[], title?: string): Promise<FolderChoice | null> {
		return new Promise(resolve => {
			let settled = false;
			const settle = (choice: FolderChoice | null): void => {
				if (settled) return;
				settled = true;
				resolve(choice);
			};
			const modal = new EagleFolderModal(this.app, folders, choice => settle(choice), { title });
			modal.onClosed = () => window.setTimeout(() => settle(null), 0);
			modal.open();
		});
	}

	/** Same close-before-choose ordering as promptForFolder — see that comment. */
	private promptForLibrary(libraries: EagleLibraryProfile[], activePath: string): Promise<EagleLibraryProfile | null> {
		return new Promise(resolve => {
			let settled = false;
			const settle = (library: EagleLibraryProfile | null): void => {
				if (settled) return;
				settled = true;
				resolve(library);
			};
			const modal = new EagleLibraryModal(this.app, libraries, activePath, library => settle(library));
			modal.onClosed = () => window.setTimeout(() => settle(null), 0);
			modal.open();
		});
	}

	/** Turn a 'create' choice into a real folder, returning its new id. */
	private async materializeFolderChoice(choice: FolderChoice): Promise<string | undefined> {
		if (choice.kind !== 'create' || !choice.newFolderName) {
			return choice.folderId || undefined;
		}
		const created = await this.api.createFolder(choice.newFolderName, choice.parentId || undefined);
		if (!created) {
			new Notice(`Could not create Eagle folder "${choice.newFolderName}" — importing to the library root`);
			return undefined;
		}
		new Notice(`Created Eagle folder "${choice.folderPath}"`);
		return created.id;
	}

	/**
	 * Run an import against the configured target library, switching Eagle if
	 * needed and switching back afterwards. Returns null when the user cancels a
	 * prompt or the target could not be reached.
	 */
	private async runInTargetLibrary<T>(fn: (folderId: string | undefined) => Promise<T>): Promise<T | null> {
		const active = await this.api.getActiveLibrary();
		if (!active) {
			new Notice('Eagle is not running');
			return null;
		}

		// 1. Decide the library.
		let targetPath = active.path;
		if (this.settings.libraryTargetMode === 'default' && this.settings.defaultLibraryPath) {
			targetPath = this.settings.defaultLibraryPath;
		} else if (this.settings.libraryTargetMode === 'ask' && this.settings.libraries.length > 0) {
			const picked = await this.promptForLibrary(this.settings.libraries, active.path);
			if (!picked) return null;
			targetPath = picked.path;
		}

		// 2. Switch if that is not what is open.
		const mustSwitch = targetPath !== active.path;
		if (mustSwitch) {
			const notice = new Notice(`Switching Eagle to ${libraryNameFromPath(targetPath)}…`, 0);
			const result = await this.api.switchLibrary(targetPath, {
				timeoutMs: this.settings.librarySwitchTimeoutMs,
			});
			notice.hide();
			if (!result.success) {
				return this.onLibrarySwitchFailed(targetPath, active.path, result.error);
			}
		}

		try {
			// 3. Decide the folder, inside the library that is now open.
			let folderId: string | undefined;
			if (this.settings.folderTargetMode === 'ask') {
				const choice = await this.promptForFolder(await this.getFlatFolders(), 'Import into Eagle folder…');
				if (!choice) return null;
				folderId = await this.materializeFolderChoice(choice);
			} else if (this.settings.folderTargetMode === 'library-default') {
				const profile = await this.profileForActiveLibrary();
				folderId = profile ? await this.resolveFolderForProfile(profile) : undefined;
			}

			return await fn(folderId);
		} finally {
			// 4. Put the user's library back.
			if (mustSwitch && this.settings.restoreLibraryAfterImport) {
				await this.restoreLibrary(active.path, targetPath);
			}
		}
	}

	/**
	 * DECISION POINT — what to do when Eagle will not open the target library.
	 *
	 * The switch can fail for reasons we cannot distinguish from here: the library
	 * lives on an unmounted volume, Eagle is showing a modal, or it is simply
	 * slower than `librarySwitchTimeoutMs`. Two defensible policies:
	 *
	 *   ABORT (implemented) — tell the user and import nothing. Their paste is
	 *   lost and must be redone, but nothing lands in the wrong library.
	 *
	 *   FALL BACK — import into whatever library is open, warning loudly. The
	 *   paste survives, but assets can end up scattered across libraries, and
	 *   Eagle has no API to move an item between folders afterwards, let alone
	 *   between libraries — so cleaning up means re-importing by hand.
	 *
	 * Returning null aborts; returning a value continues the import.
	 */
	private onLibrarySwitchFailed(targetPath: string, activePath: string, error?: string): null {
		new Notice(
			`Could not open ${libraryNameFromPath(targetPath)} in Eagle — import cancelled. ${error ?? ''}`.trim(),
			8000
		);
		console.error('[CMDS Eagle] library switch failed', { targetPath, activePath, error });
		return null;
	}

	/**
	 * Learn about every library Eagle remembers, plus the one open now, and keep a
	 * profile for each. Profiles are additive — an existing default folder is never
	 * overwritten by a rescan.
	 */
	async detectLibraries(): Promise<number> {
		const active = await this.api.getActiveLibrary();
		const history = await this.api.listLibraryHistory();

		// Fold profiles saved before paths were normalised. Eagle's history lists
		// one library both with and without a trailing separator, which used to
		// produce two profiles for it. Keep whichever copy carries a folder.
		let deduped: EagleLibraryProfile[] = [];
		for (const profile of this.settings.libraries) {
			if (libraryProfileFor(deduped, profile.path) && !profile.defaultFolderId) continue;
			deduped = upsertLibraryProfile(deduped, profile);
		}
		this.settings.libraries = deduped;

		const paths = new Set(history.map(normalizeLibraryPath));
		if (active) paths.add(normalizeLibraryPath(active.path));

		for (const path of paths) {
			if (libraryProfileFor(this.settings.libraries, path)) continue;
			this.settings.libraries = upsertLibraryProfile(this.settings.libraries, {
				path,
				name: path === active?.path ? active.name : libraryNameFromPath(path),
				defaultFolderId: '',
				defaultFolderPath: '',
			});
		}

		await this.saveSettings();
		return this.settings.libraries.length;
	}

	/**
	 * Folders of an arbitrary library. Eagle can only report the open one, so this
	 * switches, reads and switches back — roughly two seconds of round trip.
	 */
	private async foldersForLibrary(libraryPath: string): Promise<FlatEagleFolder[] | null> {
		const active = await this.api.getActiveLibrary();
		if (!active) {
			new Notice('Eagle is not running');
			return null;
		}

		if (active.path === libraryPath) {
			return this.getFlatFolders();
		}

		const notice = new Notice(`Opening ${libraryNameFromPath(libraryPath)} in Eagle…`, 0);
		const switched = await this.api.switchLibrary(libraryPath, {
			timeoutMs: this.settings.librarySwitchTimeoutMs,
		});
		notice.hide();
		if (!switched.success) {
			this.onLibrarySwitchFailed(libraryPath, active.path, switched.error);
			return null;
		}

		try {
			return await this.getFlatFolders();
		} finally {
			await this.restoreLibrary(active.path, libraryPath);
		}
	}

	/** Pick — or create — the folder that imports into `libraryPath` should land in. */
	async setDefaultFolderForLibrary(libraryPath: string): Promise<boolean> {
		const profile = libraryProfileFor(this.settings.libraries, libraryPath);
		if (!profile) return false;

		const folders = await this.foldersForLibrary(libraryPath);
		if (!folders) return false;

		const choice = await this.promptForFolder(folders, `Default folder for ${profile.name}…`);
		if (!choice) return false;

		// Creating has to happen with that library open, so it runs in the same trip.
		let folderId = choice.folderId;
		let folderPath = choice.folderPath;
		if (choice.kind === 'create') {
			const created = await this.withLibraryOpen(libraryPath, () =>
				this.materializeFolderChoice(choice));
			if (!created) return false;
			folderId = created;
		}

		this.settings.libraries = upsertLibraryProfile(this.settings.libraries, {
			...profile,
			defaultFolderId: folderId,
			defaultFolderPath: folderPath,
		});
		await this.saveSettings();
		new Notice(`${profile.name} → ${folderPath || 'library root'}`);
		return true;
	}

	async clearDefaultFolderForLibrary(libraryPath: string): Promise<void> {
		const profile = libraryProfileFor(this.settings.libraries, libraryPath);
		if (!profile) return;
		this.settings.libraries = upsertLibraryProfile(this.settings.libraries, {
			...profile,
			defaultFolderId: '',
			defaultFolderPath: '',
		});
		await this.saveSettings();
	}

	/** Run `fn` with `libraryPath` open, then put the previous library back. */
	private async withLibraryOpen<T>(libraryPath: string, fn: () => Promise<T>): Promise<T | null> {
		const active = await this.api.getActiveLibrary();
		if (!active) return null;
		if (active.path === libraryPath) return fn();

		const switched = await this.api.switchLibrary(libraryPath, {
			timeoutMs: this.settings.librarySwitchTimeoutMs,
		});
		if (!switched.success) {
			this.onLibrarySwitchFailed(libraryPath, active.path, switched.error);
			return null;
		}
		try {
			return await fn();
		} finally {
			await this.restoreLibrary(active.path, libraryPath);
		}
	}

	/**
	 * Put `previousPath` back after a round trip — unless Eagle is no longer on the
	 * library we switched it to, which means the user picked something else in
	 * Eagle while we were working. Their choice wins; yanking the library back
	 * under them would be worse than leaving it where they put it.
	 */
	private async restoreLibrary(previousPath: string, expectedPath: string): Promise<void> {
		const now = await this.api.getActiveLibrary();
		if (now && normalizeLibraryPath(now.path) !== normalizeLibraryPath(expectedPath)) {
			console.log('[CMDS Eagle] library changed during the operation; leaving Eagle on', now.path);
			return;
		}
		await this.api.switchLibrary(previousPath, { timeoutMs: this.settings.librarySwitchTimeoutMs });
	}


	/** Switch Eagle's open library from Obsidian, without importing anything. */
	private async switchLibraryCommand(): Promise<void> {
		if (this.settings.libraries.length === 0) {
			await this.detectLibraries();
		}
		const active = await this.api.getActiveLibrary();
		if (!active) {
			new Notice('Eagle is not running');
			return;
		}
		const picked = await this.promptForLibrary(this.settings.libraries, active.path);
		if (!picked || picked.path === active.path) return;

		const notice = new Notice(`Switching Eagle to ${picked.name}…`, 0);
		const result = await this.api.switchLibrary(picked.path, {
			timeoutMs: this.settings.librarySwitchTimeoutMs,
		});
		notice.hide();
		if (result.success) {
			new Notice(`Eagle is now on ${picked.name}`);
		} else {
			this.onLibrarySwitchFailed(picked.path, active.path, result.error);
		}
	}

	private openSearchModal(): void {
		new EagleSearchModal(this.app, {
			api: this.api,
			settings: this.settings,
			buildEmbed: (item: EagleItem) =>
				this.buildEmbedForItem(item, this.app.workspace.getActiveFile()?.path ?? ''),
		}).open();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		if (this.api) {
			this.api.updateSettings(this.settings);
		}
	}

	private async insertFromClipboard(editor: Editor): Promise<void> {
		const clipboardText = await navigator.clipboard.readText();
		const parsed = parseEagleUrl(clipboardText.trim());

		if (!parsed || parsed.type !== 'item') {
			new Notice('Clipboard does not contain a valid Eagle item URL');
			return;
		}

		const item = await this.api.getItemInfo(parsed.id);
		if (!item) {
			new Notice('Could not fetch item info from Eagle');
			return;
		}

		void this.insertItemLink(editor, item);
		new Notice(`Inserted link to: ${item.name}`);
	}

	private async insertItemLink(editor: Editor, item: EagleItem): Promise<void> {
		if (this.settings.insertAsEmbed) {
			// Search-and-insert emits the same canonical form as capture, so a note
			// looks the same regardless of which direction produced the reference.
			const notePath = this.app.workspace.getActiveFile()?.path ?? '';
			editor.replaceSelection(await this.buildEmbedForItem(item, notePath));
			return;
		}

		const linkUrl = buildEagleItemUrl(item.id);
		if (this.settings.insertThumbnail) {
			const card = this.buildLinkCard(item);
			editor.replaceSelection(card);
		} else {
			const link = this.settings.linkFormat === 'wikilink'
				? `[[${linkUrl}|${item.name}]]`
				: `[${item.name}](${linkUrl})`;
			editor.replaceSelection(link);
		}
	}

	private buildLinkCard(item: EagleItem): string {
		const linkUrl = buildEagleItemUrl(item.id);
		const tags = item.tags
			.filter(t => !t.startsWith('r2:') && t !== 'r2-cloud')
			.map(t => `#${this.normalizeTag(t)}`)
			.join(' ');
		const dimensions = item.width && item.height ? `${item.width}×${item.height}` : 'N/A';
		
		const imageUrl = this.getImageUrl(item);
		const cloudUrl = this.api.getCloudUrl(item);
		const isUploaded = hasR2Upload(item);

		let imageSection = '';
		if (this.settings.embedImageInCard && imageUrl) {
			imageSection = `> ![${item.name}](${imageUrl})\n>\n`;
		}

		let linkSection = `> [Open in Eagle](${linkUrl})`;
		if (cloudUrl) {
			linkSection += ` | [Cloud URL](${cloudUrl})`;
		}

		return `> [!cmdspace-eagle] ${item.name}
> 
${imageSection}> | Property | Value |
> |----------|-------|
> | **Type** | ${item.ext.toUpperCase()} |
> | **Size** | ${this.formatFileSize(item.size)} |
> | **Dimensions** | ${dimensions} |
> | **R2 Status** | ${isUploaded ? '☁️ Uploaded' : '📁 Local only'} |
> | **Tags** | ${tags || 'None'} |
${item.annotation ? `> | **Annotation** | ${item.annotation} |\n` : ''}${linkSection}

`;
	}

	private getImageUrl(item: EagleItem): string | null {
		const cloudUrl = this.api.getCloudUrl(item);
		const localUrl = this.api.getLocalThumbnailUrl(item.id);

		switch (this.settings.imageDisplayMode) {
			case 'cloud':
				return cloudUrl || localUrl;
			case 'local':
				return localUrl;
			case 'both':
				return cloudUrl || localUrl;
			default:
				return cloudUrl || localUrl;
		}
	}

	private async refreshCurrentNoteMetadata(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active file');
			return;
		}

		const content = await this.app.vault.read(activeFile);
		const eagleLinks = this.extractEagleLinks(content);

		if (eagleLinks.length === 0) {
			new Notice('No Eagle links found in current note');
			return;
		}

		new Notice(`Found ${eagleLinks.length} Eagle links. Refreshing...`);

		for (const id of eagleLinks) {
			const item = await this.api.getItemInfo(id);
			if (item) {
				console.log(`Refreshed: ${item.name}`);
			}
		}

		new Notice('Eagle metadata refreshed');
	}

	private extractEagleLinks(content: string): string[] {
		const regex = /eagle:\/\/item\/([A-Z0-9]+)/gi;
		const matches: string[] = [];
		let match;
		while ((match = regex.exec(content)) !== null) {
			matches.push(match[1]);
		}
		return [...new Set(matches)];
	}

	private async syncTagsToEagle(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active file');
			return;
		}

		const metadata = this.app.metadataCache.getFileCache(activeFile);
		const tags = metadata?.tags?.map(t => t.tag.replace('#', '')) || [];

		const content = await this.app.vault.read(activeFile);
		const eagleLinks = this.extractEagleLinks(content);

		if (eagleLinks.length === 0) {
			new Notice('No Eagle links found in current note');
			return;
		}

		let updated = 0;
		for (const id of eagleLinks) {
			const success = await this.api.updateItem(id, { tags });
			if (success) updated++;
		}

		new Notice(`Synced tags to ${updated}/${eagleLinks.length} Eagle items`);
	}

	private async syncTagsFromEagle(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active file');
			return;
		}

		const content = await this.app.vault.read(activeFile);
		const eagleLinks = this.extractEagleLinks(content);

		if (eagleLinks.length === 0) {
			new Notice('No Eagle links found in current note');
			return;
		}

		const allTags = new Set<string>();
		for (const id of eagleLinks) {
			const item = await this.api.getItemInfo(id);
			if (item) {
				item.tags.forEach(t => allTags.add(this.normalizeTag(t)));
			}
		}

		if (allTags.size === 0) {
			new Notice('No tags found in linked Eagle items');
			return;
		}

		await this.app.fileManager.processFrontMatter(activeFile, (frontmatter: { tags?: string[] }) => {
			const existingTags = frontmatter.tags || [];
			frontmatter.tags = [...new Set([...existingTags, ...allTags])];
		});

		new Notice(`Added ${allTags.size} tags from Eagle items`);
	}

	private async captureUrlToEagle(editor: Editor): Promise<void> {
		const clipboardText = await navigator.clipboard.readText();
		
		if (!clipboardText.startsWith('http://') && !clipboardText.startsWith('https://')) {
			new Notice('Clipboard does not contain a valid URL');
			return;
		}

		const connected = await this.api.isConnected();
		if (!connected) {
			new Notice('Eagle is not running');
			return;
		}

		const name = `Captured from Obsidian - ${new Date().toISOString()}`;
		const success = await this.runInTargetLibrary(folderId => this.api.addFromUrl({
			url: clipboardText,
			name,
			folderId,
		}));

		if (success) {
			new Notice('URL captured to Eagle');
			editor.replaceSelection(`[Captured: ${clipboardText}]`);
		} else {
			new Notice('Failed to capture URL to Eagle');
		}
	}

	private async openEagleItemUnderCursor(editor: Editor): Promise<void> {
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		
		const match = line.match(/eagle:\/\/item\/([A-Z0-9]+)/i);
		if (!match) {
			new Notice('No Eagle link found on current line');
			return;
		}

		const url = `eagle://item/${match[1]}`;
		window.open(url);
	}

	private async uploadClipboardToCloud(editor: Editor): Promise<void> {
		const clipboardText = (await navigator.clipboard.readText()).trim();
		
		let itemId: string | null = null;
		let directFilePath: string | null = null;
		
		const eagleParsed = parseEagleUrl(clipboardText);
		if (eagleParsed && eagleParsed.type === 'item') {
			itemId = eagleParsed.id;
		}
		
		if (!itemId) {
			const localhostId = parseEagleLocalhostUrl(clipboardText);
			if (localhostId) {
				itemId = localhostId;
			}
		}
		
		if (!itemId && this.isEagleLibraryPath(clipboardText)) {
			directFilePath = clipboardText;
			const idMatch = clipboardText.match(/images\/([A-Z0-9]+)\.info/i);
			if (idMatch) {
				itemId = idMatch[1];
			}
		}

		if (!itemId && !directFilePath) {
			new Notice('Clipboard does not contain a valid Eagle URL or file path.\nSupported: eagle://item/ID, localhost URL, or Eagle library path');
			return;
		}

		const provider = this.getActiveCloudProvider();
		if (!provider) {
			new Notice('No cloud provider configured. Check settings.');
			return;
		}

		if (itemId) {
			const item = await this.api.getItemInfo(itemId);
			if (!item) {
				new Notice('Could not fetch item info from Eagle');
				return;
			}

			if (hasR2Upload(item)) {
				const cloudUrl = this.api.getCloudUrl(item);
				new Notice(`Already uploaded: ${cloudUrl}`);
				if (cloudUrl) {
					await navigator.clipboard.writeText(cloudUrl);
				}
				return;
			}

			new Notice(`Uploading ${item.name} to cloud...`);
			
			const filePath = await this.api.getOriginalFilePath(item);
			if (!filePath) {
				new Notice('Could not get file path from Eagle');
				return;
			}

			const filename = `${item.name}.${item.ext}`;
			const mimeType = getMimeType(item.ext);
			const result = await provider.upload(filePath, filename, mimeType);

			if (result.success && result.publicUrl) {
				new Notice(`Uploaded! Cloud URL copied to clipboard`);
				await navigator.clipboard.writeText(result.publicUrl);
				
				const markdown = `![${filename}](${result.publicUrl})`;
				editor.replaceSelection(markdown);
				
				const r2Tag = `r2:${result.key}`;
				const newTags = [...item.tags];
				if (!newTags.includes(r2Tag) && result.key) {
					newTags.push(r2Tag);
				}
				if (!newTags.includes('cloud-upload')) {
					newTags.push('cloud-upload');
				}
				await this.api.updateItem(item.id, { tags: newTags });
			} else {
				new Notice(`Upload failed: ${result.error}`);
			}
		} else if (directFilePath) {
			const filename = directFilePath.split('/').pop() || 'image';
			const ext = getExtFromFilename(filename);
			const mimeType = getMimeType(ext);

			new Notice(`Uploading ${filename} to cloud...`);
			const result = await provider.upload(directFilePath, filename, mimeType);

			if (result.success && result.publicUrl) {
				new Notice(`Uploaded! Cloud URL copied to clipboard`);
				await navigator.clipboard.writeText(result.publicUrl);
				
				const markdown = `![${filename}](${result.publicUrl})`;
				editor.replaceSelection(markdown);
			} else {
				new Notice(`Upload failed: ${result.error}`);
			}
		}
	}

	private async embedAndUploadToCloud(editor: Editor): Promise<void> {
		const clipboardText = (await navigator.clipboard.readText()).trim();
		
		let itemId: string | null = null;
		let directFilePath: string | null = null;
		
		const eagleParsed = parseEagleUrl(clipboardText);
		if (eagleParsed && eagleParsed.type === 'item') {
			itemId = eagleParsed.id;
		}
		
		if (!itemId) {
			const localhostId = parseEagleLocalhostUrl(clipboardText);
			if (localhostId) {
				itemId = localhostId;
			}
		}
		
		if (!itemId && this.isEagleLibraryPath(clipboardText)) {
			directFilePath = clipboardText;
			const idMatch = clipboardText.match(/images\/([A-Z0-9]+)\.info/i);
			if (idMatch) {
				itemId = idMatch[1];
			}
		}

		if (!itemId && !directFilePath) {
			new Notice('Clipboard does not contain a valid Eagle URL or file path');
			return;
		}

		const provider = this.getActiveCloudProvider();
		if (!provider) {
			new Notice('No cloud provider configured. Check settings.');
			return;
		}

		const providerName = this.getActiveCloudProviderName();

		if (itemId) {
			const item = await this.api.getItemInfo(itemId);
			if (!item) {
				new Notice('Could not fetch item info from Eagle');
				return;
			}

			const filePath = await this.api.getOriginalFilePath(item);
			if (!filePath) {
				new Notice('Could not get file path from Eagle');
				return;
			}

			new Notice(`Uploading ${item.name} to ${providerName}...`);
			
			const filename = `${item.name}.${item.ext}`;
			const mimeType = getMimeType(item.ext);
			const result = await provider.upload(filePath, filename, mimeType);

			if (result.success && result.publicUrl) {
				const markdown = `![${filename}](${result.publicUrl})`;
				editor.replaceSelection(markdown);
				new Notice(`Embedded and uploaded to ${providerName}!`);
				
				if (result.key) {
					const cloudTag = `cloud:${result.key}`;
					const newTags = [...item.tags];
					if (!newTags.includes(cloudTag)) {
						newTags.push(cloudTag);
					}
					if (!newTags.includes('cloud-upload')) {
						newTags.push('cloud-upload');
					}
					await this.api.updateItem(item.id, { tags: newTags });
				}
			} else {
				new Notice(`Upload failed: ${result.error}`);
			}
		} else if (directFilePath) {
			const filename = directFilePath.split('/').pop() || 'image';
			const ext = getExtFromFilename(filename);
			const mimeType = getMimeType(ext);

			new Notice(`Uploading ${filename} to ${providerName}...`);
			const result = await provider.upload(directFilePath, filename, mimeType);

			if (result.success && result.publicUrl) {
				const markdown = `![${filename}](${result.publicUrl})`;
				editor.replaceSelection(markdown);
				new Notice(`Embedded and uploaded to ${providerName}!`);
			} else {
				new Notice(`Upload failed: ${result.error}`);
			}
		}
	}

	private processActiveView(): void {
		if (!this.settings.enableCrossPlatform) return;
		if (this.settings.crossPlatformConversionMode !== 'render-only') return;

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) this.convertRenderedImages(view);
	}

	/** Live Preview creates and reuses image nodes after Markdown post-processors run. */
	private observeRenderedImages(): void {
		const observer = new MutationObserver((mutations) => {
			if (!this.settings.enableCrossPlatform) return;
			if (this.settings.crossPlatformConversionMode !== 'render-only') return;

			processRenderedImageMutations(
				mutations,
				image => this.convertImageSrcForRendering(image)
			);
		});
		observer.observe(this.app.workspace.containerEl, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['src'],
		});
		this.register(() => observer.disconnect());
	}

	private processEagleLinks(el: HTMLElement): void {
		const links = el.querySelectorAll('a[href^="eagle://"]');
		links.forEach((link) => {
			const href = link.getAttribute('href');
			if (href) {
				link.addEventListener('click', (e) => {
					e.preventDefault();
					window.open(href);
				});
				link.addClass('cmdspace-eagle-link');
			}
		});
	}

	private processFileUrls(el: HTMLElement): void {
		if (!this.settings.enableCrossPlatform) return;
		if (this.settings.crossPlatformConversionMode !== 'render-only') return;

		const images = el.querySelectorAll('img');
		images.forEach((img) => {
			this.convertImageSrcForRendering(img);
		});
	}

	/**
	 * Points one rendered image at this computer's copy. Returns true when the
	 * element was rewritten. The note on disk is never touched, so two machines
	 * viewing the same vault cannot fight over its contents.
	 */
	private convertImageSrcForRendering(img: HTMLImageElement): boolean {
		const src = img.getAttribute('src');
		if (!src) return false;

		const renderedSrc = img.getAttribute('data-xplatform-rendered-src');
		if (img.getAttribute('data-xplatform-converted') && renderedSrc === src) {
			return false;
		}
		img.removeAttribute('data-xplatform-converted');
		img.removeAttribute('data-xplatform-rendered-src');
		img.removeAttribute('data-original-src');

		const extractedPath = extractPathFromImageSrc(src);
		if (!extractedPath) return false;

		const convertedPath = remapPathToComputer(
			extractedPath,
			this.settings.computers,
			this.getCurrentComputer()
		);
		if (!convertedPath) return false;

		const convertedSrc = pathToResourceUrl(convertedPath, Platform.resourcePathPrefix);
		img.setAttribute('data-xplatform-converted', 'true');
		img.setAttribute('data-original-src', src);
		img.setAttribute('data-xplatform-rendered-src', convertedSrc);
		img.setAttribute('src', convertedSrc);
		return true;
	}

	private normalizeTag(tag: string): string {
		let normalized = tag.replace(/\s+/g, '-');
		if (this.settings.tagNormalization === 'lowercase') {
			normalized = normalized.toLowerCase();
		}
		if (this.settings.tagPrefix) {
			normalized = `${this.settings.tagPrefix}/${normalized}`;
		}
		return normalized;
	}

	private formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	// Synchronous gate for the editor-paste handler. preventDefault() must be
	// called synchronously, so detection happens here before delegating async work.
	private willHandlePaste(evt: ClipboardEvent): boolean {
		const clipboardData = evt.clipboardData;
		if (!clipboardData) return false;

		const text = clipboardData.getData('text/plain').trim();
		if (isEagleLocalhostUrl(text)) return true;
		if (this.isEagleLibraryPath(text)) return true;

		const { files } = clipboardData;
		if (!files || !this.allFilesAreImages(files)) return false;
		return this.settings.imagePasteBehavior !== 'local';
	}

	private async handlePaste(evt: ClipboardEvent, editor: Editor): Promise<void> {
		const clipboardData = evt.clipboardData;
		if (!clipboardData) return;

		const text = clipboardData.getData('text/plain').trim();

		if (isEagleLocalhostUrl(text)) {
			await this.handleEagleLocalhostUrlPaste(text, editor);
			return;
		}

		if (this.isEagleLibraryPath(text)) {
			await this.handleEagleLibraryPathPaste(text, editor);
			return;
		}

		const { files } = clipboardData;
		if (!files || !this.allFilesAreImages(files)) return;

		await this.captureImageFiles(files, editor);
	}

	// Synchronous gate for the editor-drop handler (see willHandlePaste).
	private willHandleDrop(evt: DragEvent): boolean {
		const { files } = evt.dataTransfer || { files: null };
		if (!files || !this.allFilesAreImages(files)) return false;
		return this.settings.imagePasteBehavior !== 'local';
	}

	private async handleDrop(evt: DragEvent, editor: Editor): Promise<void> {
		const { files } = evt.dataTransfer || { files: null };
		if (!files || !this.allFilesAreImages(files)) return;

		await this.captureImageFiles(files, editor);
	}

	// Shared by paste and drop — the two entry points differ only in how they
	// obtain the FileList.
	private async captureImageFiles(files: FileList, editor: Editor): Promise<void> {
		if (this.settings.imagePasteBehavior === 'local') {
			return;
		}

		const filesCopy = Array.from(files);

		if (this.settings.imagePasteBehavior === 'eagle') {
			for (const file of filesCopy) {
				await this.uploadFileWithProgress(file, editor);
			}
			return;
		}

		if (this.settings.imagePasteBehavior === 'cloud') {
			for (const file of filesCopy) {
				await this.uploadToCloudWithProgress(file, editor);
			}
			return;
		}

		const cloudProviderName = this.getActiveCloudProviderName();
		const modal = new ImagePasteChoiceModal(this.app, cloudProviderName);
		modal.open();
		const response = await modal.getResponse();

		if (response.rememberChoice && response.choice !== 'cancel') {
			this.settings.imagePasteBehavior = response.choice;
			await this.saveSettings();
		}

		if (response.choice === 'eagle') {
			for (const file of filesCopy) {
				await this.uploadFileWithProgress(file, editor);
			}
		} else if (response.choice === 'local') {
			for (const file of filesCopy) {
				await this.saveImageLocally(file, editor);
			}
		} else if (response.choice === 'cloud') {
			for (const file of filesCopy) {
				await this.uploadToCloudWithProgress(file, editor);
			}
		}
	}

	private async saveImageLocally(file: File, editor: Editor): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active file');
			return;
		}

		try {
			const buffer = await file.arrayBuffer();
			const timestamp = Date.now();
			const filename = `${timestamp}-${file.name}`;
			
			const vault = this.app.vault as unknown as { getConfig: (key: string) => string | undefined };
			const attachmentFolder = vault.getConfig?.('attachmentFolderPath') || '';
			const targetPath = resolveAttachmentPath(
				attachmentFolder,
				activeFile.parent?.path || '',
				filename
			);

			const folderPath = targetPath.substring(0, targetPath.lastIndexOf('/'));
			if (folderPath) {
				const folderExists = await this.app.vault.adapter.exists(folderPath);
				if (!folderExists) {
					await this.app.vault.createFolder(folderPath);
				}
			}

			await this.app.vault.createBinary(targetPath, buffer);
			
			const markdownImage = `![${file.name}](${encodeURI(targetPath)})`;
			editor.replaceSelection(markdownImage);
			new Notice(`Saved locally: ${file.name}`);
		} catch (error) {
			console.error('Failed to save image locally:', error);
			new Notice(`Failed to save: ${file.name}`);
		}
	}

	private async uploadFileWithProgress(file: File, editor: Editor): Promise<void> {
		const pasteId = this.generatePasteId();
		const placeholderText = `![Uploading ${file.name}...](${pasteId})`;
		
		editor.replaceSelection(placeholderText);

		try {
			const notePath = this.app.workspace.getActiveFile()?.path ?? '';
			const markdown = await this.uploadImageToEagle(file, notePath);
			this.replaceTextInDocument(editor, placeholderText, markdown);
			new Notice(`Uploaded to Eagle: ${file.name}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			const errorText = `<!-- Failed to upload ${file.name}: ${errorMessage} -->`;
			this.replaceTextInDocument(editor, placeholderText, errorText);
			console.error('Failed to upload image:', error);
			new Notice(`Failed to upload: ${file.name}`);
		}
	}

	private async uploadToCloudWithProgress(file: File, editor: Editor): Promise<void> {
		const provider = this.getActiveCloudProvider();
		if (!provider) {
			new Notice('No cloud provider configured');
			return;
		}

		const pasteId = this.generatePasteId();
		const providerName = this.getActiveCloudProviderName();
		const placeholderText = `![Uploading to ${providerName}...](${pasteId})`;
		
		editor.replaceSelection(placeholderText);

		try {
			const temp = await this.saveToTempLocation(file);
			const ext = getExtFromFilename(file.name);
			const mimeType = getMimeType(ext);

			const result = await provider.upload(temp.absolutePath, file.name, mimeType);

			if (result.success && result.publicUrl) {
				const markdownImage = `![${file.name}](${result.publicUrl})`;
				this.replaceTextInDocument(editor, placeholderText, markdownImage);
				await this.removeTempFile(temp);
				new Notice(`Uploaded to ${providerName}: ${file.name}`);
			} else {
				throw new Error(result.error || 'Upload failed');
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			const errorText = `<!-- Failed to upload ${file.name}: ${errorMessage} -->`;
			this.replaceTextInDocument(editor, placeholderText, errorText);
			console.error('Failed to upload to cloud:', error);
			new Notice(`Failed to upload: ${file.name}`);
		}
	}

	private getActiveCloudProvider(): CloudProvider | null {
		const providerType = this.settings.activeCloudProvider;
		const config = this.settings.cloudProviders[providerType];
		
		if (!config || !config.enabled) {
			if (this.settings.r2WorkerUrl && this.settings.r2ApiKey) {
				return createCloudProvider({
					type: 'r2',
					enabled: true,
					name: 'Cloudflare R2',
					workerUrl: this.settings.r2WorkerUrl,
					apiKey: this.settings.r2ApiKey,
					publicUrl: this.settings.r2PublicUrl,
				});
			}
			return null;
		}

		return createCloudProvider(config);
	}

	private getActiveCloudProviderName(): string {
		const providerType = this.settings.activeCloudProvider;
		const config = this.settings.cloudProviders[providerType];
		
		if (config?.enabled && config?.name) {
			return config.name;
		}
		
		if (this.settings.r2WorkerUrl) {
			return 'Cloudflare R2';
		}
		
		return 'Cloud';
	}

	private replaceTextInDocument(editor: Editor, searchText: string, replaceText: string): void {
		const content = editor.getValue();
		const index = content.indexOf(searchText);
		if (index === -1) return;

		const startPos = editor.offsetToPos(index);
		const endPos = editor.offsetToPos(index + searchText.length);
		editor.replaceRange(replaceText, startPos, endPos);
	}

	private generatePasteId(): string {
		return `paste-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
	}

	private getLocalImageUnderCursor(editor: Editor): { file: TFile; startPos: EditorPosition; endPos: EditorPosition; originalText: string } | null {
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		
		const supportedExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'tiff', 'tif', 'heic', 'heif', 'avif', 'ico'];
		const extensionPattern = supportedExtensions.join('|');
		const wikilinkPattern = new RegExp(`!\\[\\[([^\\]]+\\.(${extensionPattern}))\\]\\]`, 'gi');
		const markdownPattern = new RegExp(`!\\[([^\\]]*)\\]\\(([^)]+\\.(${extensionPattern}))\\)`, 'gi');
		
		let match: RegExpExecArray | null;
		
		wikilinkPattern.lastIndex = 0;
		while ((match = wikilinkPattern.exec(line)) !== null) {
			const start = match.index;
			const end = start + match[0].length;
			if (cursor.ch >= start && cursor.ch <= end) {
				const filename = match[1];
				const file = this.app.metadataCache.getFirstLinkpathDest(filename, '');
				if (file instanceof TFile) {
					return {
						file,
						startPos: { line: cursor.line, ch: start },
						endPos: { line: cursor.line, ch: end },
						originalText: match[0],
					};
				}
			}
		}
		
		markdownPattern.lastIndex = 0;
		while ((match = markdownPattern.exec(line)) !== null) {
			const start = match.index;
			const end = start + match[0].length;
			if (cursor.ch >= start && cursor.ch <= end) {
				const filepath = match[2];
				if (!filepath.startsWith('http') && !filepath.startsWith('file://') && !filepath.startsWith('eagle://')) {
					const file = this.app.metadataCache.getFirstLinkpathDest(filepath, '');
					if (file instanceof TFile) {
						return {
							file,
							startPos: { line: cursor.line, ch: start },
							endPos: { line: cursor.line, ch: end },
							originalText: match[0],
						};
					}
				}
			}
		}
		
		return null;
	}

	private async uploadLocalImageToEagle(
		editor: Editor,
		localImage: { file: TFile; startPos: EditorPosition; endPos: EditorPosition; originalText: string }
	): Promise<void> {
		const { file, startPos, endPos, originalText } = localImage;
		
		const placeholderText = `![Uploading ${file.name}...](uploading)`;
		editor.replaceRange(placeholderText, startPos, endPos);
		
		try {
			const connected = await this.api.isConnected();
			if (!connected) {
				throw new Error('Eagle is not running');
			}

			const absolutePath = this.getAbsolutePath(file.path);
			const filenameWithoutExt = file.basename;
			
			const notePath = this.app.workspace.getActiveFile()?.path ?? '';

			// Everything Eagle-facing runs inside the target library: the item, its
			// original file and its thumbnail only exist while that library is open.
			const imported = await this.runInTargetLibrary(async folderId => {
				const result = await this.api.addFromPath({
					path: absolutePath,
					name: filenameWithoutExt,
					folderId,
				});

				if (!result.success || !result.itemId) {
					throw new Error('Failed to add image to Eagle');
				}

				const item = await this.waitForImportedItem(result.itemId);
				if (!item) {
					throw new Error(`Eagle accepted the file but did not return item ${result.itemId}`);
				}
				const originalFilePath = await this.waitForImportedOriginal(item);
				if (!originalFilePath) {
					throw new Error(`Eagle returned item ${result.itemId}, but its original file is not ready`);
				}

				return { item, markdown: await this.buildEmbedForItem(item, notePath, { originalFilePath }) };
			});

			if (!imported) {
				throw new Error('Import cancelled');
			}

			this.replaceTextInDocument(editor, placeholderText, imported.markdown);

			new Notice(`Uploaded to Eagle: ${file.name}`);

			await this.offerToReplaceOtherReferences(file, imported.item, { line: startPos.line, ch: startPos.ch });

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			this.replaceTextInDocument(editor, placeholderText, originalText);
			new Notice(`Failed to upload: ${errorMessage}`);
		}
	}

	// ── Vault backfill ──────────────────────────────────────────────────────
	// Existing vaults already carry originals. These commands move them into
	// Eagle, rewrite every reference to the canonical form, and send the vault
	// copy to the system trash — reversible, but never silent.

	private async migrateLocalImagesToEagle(scope: 'note' | 'vault'): Promise<void> {
		if (!(await this.api.isConnected())) {
			new Notice('Eagle is not running — start it and try again');
			return;
		}

		const targets = this.collectMigratableImages(scope);
		if (!targets) return;
		if (targets.length === 0) {
			new Notice(scope === 'vault' ? 'No local images found in the vault' : 'No local images found in this note');
			return;
		}

		const totalMB = (targets.reduce((sum, file) => sum + file.stat.size, 0) / (1024 * 1024)).toFixed(1);
		const modal = new ConfirmActionModal(this.app, {
			title: 'Move images into Eagle',
			body: `${targets.length} image(s), ${totalMB} MB. Each one is imported into Eagle, every reference to it is rewritten to a thumbnail reference, and the vault copy is moved to the system trash.`,
			confirmLabel: 'Move to Eagle',
		});
		modal.open();
		if (!(await modal.getResponse())) return;

		new Notice(`Moving ${targets.length} image(s) into Eagle…`);

		let moved = 0;
		const failures: string[] = [];
		// One library switch for the whole batch. Wrapping each image instead would
		// cost a ~1s switch per file and leave the library flapping.
		const ran = await this.runInTargetLibrary(async folderId => {
			for (const file of targets) {
				const succeeded = await this.migrateSingleImage(file, folderId);
				if (succeeded) {
					moved++;
				} else {
					failures.push(file.path);
				}
			}
			return true;
		});
		if (!ran) return;

		if (failures.length > 0) {
			console.warn('[CMDS Eagle] Files left in the vault:', failures);
		}
		new Notice(
			failures.length === 0
				? `Moved ${moved} image(s) into Eagle`
				: `Moved ${moved} image(s); ${failures.length} left in the vault — see console`
		);
	}

	/**
	 * Import one vault file, rewrite every reference to it, then trash the original.
	 * `folderId` is resolved once by the caller — this runs inside an already
	 * switched-to target library.
	 */
	private async migrateSingleImage(file: TFile, folderId: string | undefined): Promise<boolean> {
		try {
			const result = await this.api.addFromPath({
				path: this.getAbsolutePath(file.path),
				name: file.basename,
				folderId,
			});
			if (!result.success || !result.itemId) return false;

			const item = await this.waitForImportedItem(result.itemId);
			if (!item) return false;
			const originalFilePath = await this.waitForImportedOriginal(item);
			if (!originalFilePath) return false;

			const references = this.findAllReferencesToFile(file);
			await this.replaceAllReferences(references, item, originalFilePath);

			// Trash only after every reference points at Eagle, so a failure
			// midway leaves the vault copy in place rather than a broken link.
			await this.app.fileManager.trashFile(file);
			return true;
		} catch (error) {
			console.error('[CMDS Eagle] Failed to migrate:', file.path, error);
			return false;
		}
	}

	private collectMigratableImages(scope: 'note' | 'vault'): TFile[] | null {
		let notes: TFile[];
		if (scope === 'vault') {
			notes = this.app.vault.getMarkdownFiles();
		} else {
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile) {
				new Notice('No active file');
				return null;
			}
			notes = [activeFile];
		}

		const seen = new Set<string>();
		const targets: TFile[] = [];
		for (const note of notes) {
			const cache = this.app.metadataCache.getFileCache(note);
			for (const embed of cache?.embeds ?? []) {
				const dest = this.app.metadataCache.getFirstLinkpathDest(embed.link, note.path);
				if (!dest || seen.has(dest.path) || !this.isMigratableImage(dest)) continue;
				seen.add(dest.path);
				targets.push(dest);
			}
		}
		return targets;
	}

	private isMigratableImage(file: TFile): boolean {
		const thumbnailDir = this.settings.vaultThumbnailDir.replace(/^\/+|\/+$/g, '');
		// Our own thumbnails are derivatives of Eagle items, not originals.
		if (thumbnailDir && file.path.startsWith(`${thumbnailDir}/`)) return false;
		if (file.path.startsWith(`${TEMP_DIR}/`)) return false;

		const extensions: readonly string[] = SUPPORTED_IMAGE_EXTENSIONS;
		return extensions.includes(file.extension.toLowerCase());
	}

	/**
	 * Deleting an item in Eagle leaves the vault thumbnail behind and the
	 * `eagle://` link dead. Nothing detects that on its own, so this reports it.
	 */
	/**
	 * Report which of a note's Eagle references still resolve.
	 *
	 * Two independent failures are possible and the old check saw neither
	 * reliably. A `file://` embed breaks when the FILE is gone — which is what
	 * actually blanks the image, and it stays invisible until the window reloads
	 * because Chromium serves the old bytes from memory. A deep link breaks when
	 * the ITEM is gone. And because item lookups only ever hit the open library,
	 * a note mixing two libraries used to report half its links as dead.
	 */
	private async verifyEagleLinks(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active file');
			return;
		}

		const refs = parseEagleReferences(await this.app.vault.read(activeFile));
		if (refs.length === 0) {
			new Notice('No Eagle links in this note');
			return;
		}

		// A missing file is checked on disk, so it costs nothing and needs no switching.
		const missingFiles: string[] = [];
		for (const ref of refs) {
			if (!ref.filePath) continue;
			try {
				await fsp.stat(ref.filePath);
			} catch {
				missingFiles.push(ref.id);
			}
		}

		const active = await this.api.getActiveLibrary();
		if (!active) {
			new Notice('Eagle is not running — checked files on disk only');
			this.reportVerification(refs, missingFiles, [], true);
			return;
		}

		const grouped = groupReferencesByLibrary(refs);
		const unknown = grouped.get('') ?? [];
		const libraries = [...grouped.keys()].filter(Boolean);
		if (!libraries.includes(normalizeLibraryPath(active.path))) {
			libraries.unshift(normalizeLibraryPath(active.path));
		}

		const resolved = new Set<string>();
		const deadItems: string[] = [];

		for (const libraryPath of libraries) {
			const opened = await this.withLibraryOpen(libraryPath, async () => {
				// Items known to live here, plus any still-unplaced deep links.
				const candidates = [...(grouped.get(libraryPath) ?? []), ...unknown.filter(r => !resolved.has(r.id))];
				for (const ref of candidates) {
					const item = await this.api.getItemInfo(ref.id);
					if (item && !item.isDeleted) resolved.add(ref.id);
				}
				return true;
			});
			if (!opened) {
				console.warn('[CMDS Eagle] Could not open library for verification:', libraryPath);
			}
		}

		for (const ref of refs) {
			if (!resolved.has(ref.id)) deadItems.push(ref.id);
		}

		this.reportVerification(refs, missingFiles, deadItems, false);
	}

	private reportVerification(
		refs: { id: string; filePath?: string }[],
		missingFiles: string[],
		deadItems: string[],
		filesOnly: boolean
	): void {
		const broken = new Set([...missingFiles, ...deadItems]);
		if (broken.size === 0) {
			new Notice(`All ${refs.length} Eagle reference(s) resolve`);
			return;
		}

		console.warn('[CMDS Eagle] Verification results', {
			missingFiles,
			deadItems,
			note: 'A missing file blanks the image; the old one may still show until Obsidian reloads.',
		});

		const parts: string[] = [];
		if (missingFiles.length > 0) parts.push(`${missingFiles.length} embedded file(s) missing on disk`);
		if (!filesOnly && deadItems.length > 0) parts.push(`${deadItems.length} item(s) gone from Eagle`);
		new Notice(`${broken.size} of ${refs.length} Eagle reference(s) broken — ${parts.join(', ')}. See console for ids.`, 10000);
	}

	private async offerToReplaceOtherReferences(
		originalFile: TFile,
		item: EagleItem,
		excludePosition: { line: number; ch: number }
	): Promise<void> {
		const references = this.findAllReferencesToFile(originalFile);
		
		const filteredRefs: { notePath: string; positions: { line: number; ch: number; text: string }[] }[] = [];
		for (const ref of references) {
			const filteredPositions = ref.positions.filter(pos => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && ref.notePath === activeFile.path) {
					return !(pos.line === excludePosition.line && pos.ch === excludePosition.ch);
				}
				return true;
			});
			if (filteredPositions.length > 0) {
				filteredRefs.push({ notePath: ref.notePath, positions: filteredPositions });
			}
		}

		if (filteredRefs.length === 0) return;

		const totalCount = filteredRefs.reduce((sum, ref) => sum + ref.positions.length, 0);
		const fileCount = filteredRefs.length;

		const shouldReplace = await this.confirmReplaceReferences(totalCount, fileCount, originalFile.name);
		if (!shouldReplace) return;

		await this.replaceAllReferences(filteredRefs, item);
		new Notice(`Replaced ${totalCount} references in ${fileCount} files`);
	}

	private findAllReferencesToFile(targetFile: TFile): { notePath: string; positions: { line: number; ch: number; text: string }[] }[] {
		const results: { notePath: string; positions: { line: number; ch: number; text: string }[] }[] = [];
		const allFiles = this.app.vault.getMarkdownFiles();

		for (const file of allFiles) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache?.embeds) continue;

			const positions: { line: number; ch: number; text: string }[] = [];
			for (const embed of cache.embeds) {
				const linkedFile = this.app.metadataCache.getFirstLinkpathDest(embed.link, file.path);
				if (linkedFile === targetFile) {
					positions.push({
						line: embed.position.start.line,
						ch: embed.position.start.col,
						text: embed.original,
					});
				}
			}

			if (positions.length > 0) {
				results.push({ notePath: file.path, positions });
			}
		}

		return results;
	}

	private async confirmReplaceReferences(count: number, fileCount: number, filename: string): Promise<boolean> {
		return new Promise((resolve) => {
			const notice = new Notice(
				`Found ${count} other references to "${filename}" in ${fileCount} files. Click to replace all with Eagle link.`,
				10000
			);
			
			const noticeEl = (notice as unknown as { noticeEl: HTMLElement }).noticeEl;
			noticeEl.addClass('cmds-eagle-clickable-notice');
			noticeEl.onclick = () => {
				notice.hide();
				resolve(true);
			};
			
			window.setTimeout(() => resolve(false), 10000);
		});
	}

	private async replaceAllReferences(
		references: { notePath: string; positions: { line: number; ch: number; text: string }[] }[],
		item: EagleItem,
		originalFilePath?: string
	): Promise<void> {
		for (const ref of references) {
			const file = this.app.vault.getAbstractFileByPath(ref.notePath);
			if (!(file instanceof TFile)) continue;

			// The thumbnail path is relative to each note, so it is rebuilt per file.
			// These replacements are inline, so the card is left out.
			const newMarkdown = await this.buildEmbedForItem(item, ref.notePath, {
				includeCard: false,
				originalFilePath,
			});

			let content = await this.app.vault.read(file);

			const sortedPositions = [...ref.positions].sort((a, b) => {
				if (a.line !== b.line) return b.line - a.line;
				return b.ch - a.ch;
			});

			for (const pos of sortedPositions) {
				const lines = content.split('\n');
				const line = lines[pos.line];
				if (line) {
					const index = line.indexOf(pos.text, pos.ch);
					if (index !== -1) {
						lines[pos.line] = line.substring(0, index) + newMarkdown + line.substring(index + pos.text.length);
						content = lines.join('\n');
					}
				}
			}

			await this.app.vault.modify(file, content);
		}
	}

	private async handleEagleLocalhostUrlPaste(url: string, editor: Editor): Promise<void> {
		const itemId = parseEagleLocalhostUrl(url);
		if (!itemId) {
			new Notice('Invalid Eagle URL');
			return;
		}

		const item = await this.api.getItemInfo(itemId);
		if (!item) {
			new Notice('Could not fetch item info from Eagle');
			return;
		}

		const filePath = await this.getEagleItemFilePath(itemId, item.name, item.ext);
		if (filePath) {
			const fileUrl = this.pathToFileUrl(filePath);
			const filename = `${item.name}.${item.ext}`;
			const markdown = `![${filename}](${fileUrl})`;
			editor.replaceSelection(markdown);
			new Notice(`Embedded: ${filename}`);
		} else {
			new Notice('Could not get file path from Eagle');
		}
	}

	private isEagleLibraryPath(text: string): boolean {
		if (text.startsWith('![') || text.startsWith('](')) {
			return false;
		}
		const normalizedText = text.replace(/\\/g, '/');
		return normalizedText.includes('.library/images/') && normalizedText.includes('.info/');
	}

	private async handleEagleLibraryPathPaste(path: string, editor: Editor): Promise<void> {
		// pathToFileUrl expects a plain filesystem path, so strip any file:// scheme.
		const normalizedPath = safeDecodeUri(path.replace(/\\/g, '/')).replace(/^file:\/\/+/, '/');

		// Eagle puts the *thumbnail* file path on the clipboard. The enclosing
		// ".../<itemId>.info/" folder holds both the thumbnail and the original,
		// and its name is the Eagle item id — use it to resolve the original asset.
		const idMatch = normalizedPath.match(/\/([A-Za-z0-9]+)\.info\//);
		if (idMatch) {
			const item = await this.api.getItemInfo(idMatch[1]);
			if (item) {
				const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
				const originalPath = `${folderPath}/${item.name}.${item.ext}`;
				const filename = `${item.name}.${item.ext}`;
				editor.replaceSelection(`![${filename}](${this.pathToFileUrl(originalPath)})`);
				new Notice(`Embedded: ${filename}`);
				return;
			}
		}

		// Fallback (Eagle unreachable / unexpected path): drop a "_thumbnail" suffix
		// if present so we still prefer the original, otherwise embed verbatim.
		const fallbackPath = normalizedPath.replace(/_thumbnail(\.[A-Za-z0-9]+)$/, '$1');
		const filename = fallbackPath.split('/').pop() || 'image';
		editor.replaceSelection(`![${filename}](${this.pathToFileUrl(fallbackPath)})`);
		new Notice(`Embedded: ${filename}`);
	}

	private async getEagleItemFilePath(itemId: string, name: string, ext: string): Promise<string | null> {
		const thumbnailPath = await this.api.getThumbnailPath(itemId);
		if (!thumbnailPath) return null;

		const decodedPath = safeDecodeUri(thumbnailPath);
		const folderPath = decodedPath.substring(0, decodedPath.lastIndexOf('/'));
		const originalFileName = `${name}.${ext}`;
		return `${folderPath}/${originalFileName}`;
	}

	// ── Excalidraw integration ──────────────────────────────────────────────
	// Obsidian's editor-paste/editor-drop events only fire in the Markdown editor,
	// not in an Excalidraw canvas. And the Excalidraw plugin's onPasteHook receives
	// an already-consumed clipboard (no image bytes). So we attach capture-phase
	// paste/drop listeners on each Excalidraw view container: this intercepts BEFORE
	// Excalidraw, handles Eagle references (embed the ORIGINAL) and pasted image
	// files (upload to the cloud provider), and suppresses Excalidraw's default
	// handling — embedding a portable cloud URL instead of a vault attachment.

	private registerExcalidrawIntegration(): void {
		this.app.workspace.onLayoutReady(() => {
			this.scanAndAttachExcalidrawContainers();
			// Attach to canvases as they are opened / the layout changes.
			this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
				this.scanAndAttachExcalidrawContainers();
			}));
			this.registerEvent(this.app.workspace.on('layout-change', () => {
				this.scanAndAttachExcalidrawContainers();
			}));
		});
	}

	// Public so the settings toggle can attach to already-open canvases immediately.
	scanAndAttachExcalidrawContainers(): void {
		if (!this.settings.excalidrawIntegration) return;
		for (const leaf of this.app.workspace.getLeavesOfType('excalidraw')) {
			const view = leaf.view as unknown as ExcalidrawViewLike;
			const el = view?.containerEl;
			// Feature-detect the view API so an Excalidraw version drift fails soft.
			if (!el || this.attachedExcalidrawContainers.has(el) || typeof view.addImageWithURL !== 'function') continue;
			this.attachedExcalidrawContainers.add(el);
			this.registerDomEvent(el, 'paste', (evt) => this.onExcalidrawPasteOrDrop(evt, view), { capture: true });
			this.registerDomEvent(el, 'drop', (evt) => this.onExcalidrawPasteOrDrop(evt, view), { capture: true });
		}
	}

	private onExcalidrawPasteOrDrop(evt: ClipboardEvent | DragEvent, view: ExcalidrawViewLike): void {
		if (!this.settings.excalidrawIntegration) return;
		const dt = evt instanceof ClipboardEvent ? evt.clipboardData : evt.dataTransfer;
		if (!dt) return;

		const text = (dt.getData('text/plain') || '').trim();
		if (this.isEagleReference(text)) {
			evt.preventDefault();
			evt.stopImmediatePropagation();
			void this.addEagleRefToCanvas(view, text);
			return;
		}

		const images = Array.from(dt.files).filter((f) => f.type.startsWith('image/'));
		if (images.length > 0) {
			evt.preventDefault();
			evt.stopImmediatePropagation();
			void this.addImageFilesToCanvas(view, images);
			return;
		}
		// Neither an Eagle reference nor an image — let Excalidraw handle it natively.
	}

	private isEagleReference(text: string): boolean {
		return !!text && (isEagleLocalhostUrl(text) || this.isEagleLibraryPath(text));
	}

	private async resolveEagleItemFromReference(text: string): Promise<EagleItem | null> {
		if (isEagleLocalhostUrl(text)) {
			const id = parseEagleLocalhostUrl(text);
			return id ? this.api.getItemInfo(id) : null;
		}
		const idMatch = text.replace(/\\/g, '/').match(/\/([A-Za-z0-9]+)\.info\//);
		return idMatch ? this.api.getItemInfo(idMatch[1]) : null;
	}

	private async getEaglePublicUrl(item: EagleItem): Promise<string | null> {
		// Reuse an existing cloud (R2) upload if the item already has one.
		const existing = this.api.getCloudUrl(item);
		if (existing) return existing;

		const provider = this.getActiveCloudProvider();
		if (!provider) {
			new Notice('No cloud provider configured for Excalidraw embed');
			return null;
		}
		const originalPath = await this.api.getOriginalFilePath(item);
		if (!originalPath) return null;

		const result = await provider.upload(originalPath, `${item.name}.${item.ext}`, getMimeType(item.ext));
		return result.success && result.publicUrl ? result.publicUrl : null;
	}

	private async addEagleRefToCanvas(view: ExcalidrawViewLike, text: string): Promise<void> {
		try {
			const item = await this.resolveEagleItemFromReference(text);
			if (!item) {
				new Notice('Could not fetch item info from Eagle');
				return;
			}
			const url = await this.getEaglePublicUrl(item);
			if (!url) {
				new Notice(`Could not get a cloud URL for ${item.name}`);
				return;
			}
			await view.addImageWithURL(url);
			new Notice(`Added to canvas: ${item.name}.${item.ext}`);
		} catch (error) {
			console.error('[CMDS Eagle] Excalidraw Eagle-ref embed failed:', error);
			new Notice('Failed to add Eagle image to Excalidraw canvas');
		}
	}

	private async addImageFilesToCanvas(view: ExcalidrawViewLike, files: File[]): Promise<void> {
		const provider = this.getActiveCloudProvider();
		if (!provider) {
			new Notice('No cloud provider configured for Excalidraw embed');
			return;
		}
		const providerName = this.getActiveCloudProviderName();

		// One library switch for the whole drop. The Eagle work has to happen while
		// the target library is still open, so the entire loop lives inside the
		// callback rather than just the folder lookup.
		if (!this.settings.excalidrawImportToEagle) {
			await this.uploadCanvasFiles(view, files, provider, providerName, undefined);
			return;
		}
		await this.runInTargetLibrary(folderId =>
			this.uploadCanvasFiles(view, files, provider, providerName, folderId));
	}

	private async uploadCanvasFiles(
		view: ExcalidrawViewLike,
		files: File[],
		provider: CloudProvider,
		providerName: string,
		folderId: string | undefined
	): Promise<boolean> {
		for (const file of files) {
			try {
				const temp = await this.saveToTempLocation(file);

				// Optionally catalogue the pasted screenshot in the Eagle library.
				let eagleNote = '';
				let canRemoveTemp = true;
				if (this.settings.excalidrawImportToEagle) {
					const added = await this.api.addFromPath({
						path: temp.absolutePath,
						name: file.name.replace(/\.[^.]+$/, ''),
						folderId,
					});
					if (added.success && added.itemId) {
						const item = await this.waitForImportedItem(added.itemId);
						const originalFilePath = item ? await this.waitForImportedOriginal(item) : null;
						if (originalFilePath) {
							eagleNote = ' + Eagle';
						} else {
							canRemoveTemp = false;
							new Notice(`Eagle import is not complete; staged copy kept at ${temp.vaultPath}`);
						}
					}
				}

				const result = await provider.upload(temp.absolutePath, file.name, getMimeType(getExtFromFilename(file.name)));
				if (result.success && result.publicUrl) {
					await view.addImageWithURL(result.publicUrl);
					if (canRemoveTemp) {
						await this.removeTempFile(temp);
					}
					new Notice(`Uploaded to ${providerName}${eagleNote} & added to canvas: ${file.name}`);
				} else {
					new Notice(`Failed to upload ${file.name}`);
				}
			} catch (error) {
				console.error('[CMDS Eagle] Excalidraw image upload failed:', error);
				new Notice(`Failed to add image to Excalidraw canvas: ${file.name}`);
			}
		}
		return true;
	}

	/**
	 * Serialises a plain filesystem path, remapping it onto this computer first.
	 * Callers pass plain paths; the encoder escapes them exactly once, so a
	 * filename containing a literal `%20` stays a literal `%20`.
	 */
	private pathToFileUrl(path: string): string {
		return pathToFileUrl(this.convertPathForCurrentPlatform(path));
	}

	private getCurrentPlatform(): PlatformType {
		return process.platform as PlatformType;
	}

	private getCurrentUsername(): string {
		try {
			return userInfo().username;
		} catch {
			return '';
		}
	}

	/**
	 * The profile describing this machine. Identity is explicit rather than derived
	 * from the vault path: now that a library root can be any absolute path, the
	 * vault may well sit on a different volume than the home directory.
	 */
	private getCurrentComputer(): ComputerProfile | null {
		return findCurrentComputer(
			this.settings.computers,
			this.getCurrentPlatform(),
			this.getCurrentUsername()
		);
	}

	/** Swaps the recording computer's library root for this one's. */
	private convertPathForCurrentPlatform(path: string): string {
		if (!this.settings.enableCrossPlatform || this.settings.computers.length === 0) {
			return path;
		}
		return remapPathToComputer(path, this.settings.computers, this.getCurrentComputer()) ?? path;
	}

	/**
	 * Imports a pasted/dropped file into Eagle and returns the canonical markdown
	 * to insert. The staging copy under `.eagle-temp/` is removed only after the
	 * original exists in Eagle at its complete byte size.
	 */
	private waitForImportedItem(itemId: string): Promise<EagleItem | null> {
		return pollEagleItemInfo(itemId, {
			timeoutMs: this.settings.connectionTimeout,
			getItemInfo: (id: string) => this.api.getItemInfo(id),
		});
	}

	private waitForImportedOriginal(item: EagleItem): Promise<string | null> {
		return pollEagleOriginalPath({
			timeoutMs: this.settings.thumbnailPollTimeoutMs,
			getOriginalFilePath: () => this.api.getOriginalFilePath(item),
			isReady: async (absolutePath: string) => {
				try {
					const stats = await fsp.stat(absolutePath);
					return stats.isFile() && stats.size === item.size;
				} catch {
					return false;
				}
			},
		});
	}

	private async uploadImageToEagle(file: File, notePath: string): Promise<string> {
		const connected = await this.api.isConnected();
		if (!connected) {
			throw new Error('Eagle is not running');
		}

		const temp = await this.saveToTempLocation(file);
		const filenameWithoutExt = file.name.replace(/\.[^.]+$/, '');
		const markdown = await this.runInTargetLibrary(async folderId => {
			const result = await this.api.addFromPath({
				path: temp.absolutePath,
				name: filenameWithoutExt,
				folderId,
			});

			if (!result.success || !result.itemId) {
				throw new Error(`Failed to add image to Eagle (staged copy kept at ${temp.vaultPath})`);
			}

			const item = await this.waitForImportedItem(result.itemId);
			if (!item) {
				throw new Error(`Eagle accepted the file but did not return item ${result.itemId} (staged copy kept at ${temp.vaultPath})`);
			}
			const originalFilePath = await this.waitForImportedOriginal(item);
			if (!originalFilePath) {
				throw new Error(`Eagle returned item ${result.itemId}, but its original file is not ready (staged copy kept at ${temp.vaultPath})`);
			}

			return this.buildEmbedForItem(item, notePath, { originalFilePath });
		});

		if (markdown === null) {
			throw new Error(`Import cancelled (staged copy kept at ${temp.vaultPath})`);
		}
		await this.removeTempFile(temp);
		return markdown;
	}

	/**
	 * The canonical embed for an Eagle item, in the shape `linkMode` asks for. The
	 * default copies the thumbnail into the vault and links it relative to the note,
	 * so the note renders on every device (absolute `file://` paths into
	 * cloud-synced storage break on reconnect and on other machines).
	 */
	private async buildEmbedForItem(
		item: EagleItem,
		notePath: string,
		options?: { includeCard?: boolean; originalFilePath?: string }
	): Promise<string> {
		const mode = this.settings.linkMode;

		// Only the photo modes copy bytes into the vault; link-only stays at zero
		// copies and the cmds-eagle modes point straight at the library.
		const thumbnailRelativePath = modeNeedsThumbnail(mode)
			? await this.materializeThumbnail(item, notePath)
			: null;

		let fileUrl: string | null = null;
		if (modeUsesOriginalFile(mode)) {
			const filePath = options?.originalFilePath ?? await this.api.getOriginalFilePath(item);
			fileUrl = filePath ? this.pathToFileUrl(filePath) : null;
			if (!fileUrl) {
				new Notice(`Could not resolve the original file for "${item.name}" — inserted a deep link instead`);
			}
		}

		return buildCanonicalEmbed(
			{
				id: item.id,
				name: item.name,
				ext: item.ext,
				size: item.size,
				width: item.width,
				height: item.height,
				tags: item.tags,
			},
			{
				mode,
				thumbnailRelativePath,
				fileUrl,
				hiddenTagPrefixes: this.settings.cardHiddenTagPrefixes,
				normalizeTag: (tag: string) => this.normalizeTag(tag),
				cloudUrl: this.api.getCloudUrl(item),
				includeCard: options?.includeCard,
			}
		);
	}

	/**
	 * Copies the item's thumbnail into the vault and returns its note-relative
	 * path, or null when it cannot be obtained — in which case the caller renders
	 * a deep link. Never falls back to a machine-local path.
	 */
	private async materializeThumbnail(item: EagleItem, notePath: string): Promise<string | null> {
		const source = await pollThumbnailPath(item.id, {
			timeoutMs: this.settings.thumbnailPollTimeoutMs,
			getThumbnailPath: (id: string) => this.api.getThumbnailPath(id),
		});
		if (!source) {
			new Notice(`Eagle thumbnail not ready for "${item.name}" — inserted a deep link instead`);
			return null;
		}

		const asset = await copyThumbnailToVault(this.app.vault, source, {
			itemId: item.id,
			assetsDir: this.settings.vaultThumbnailDir,
			maxKB: this.settings.thumbnailMaxKB,
		});
		if (!asset) {
			new Notice(`Could not read the thumbnail for "${item.name}" (library may not be available locally) — inserted a deep link instead`);
			return null;
		}
		if (asset.oversized) {
			new Notice(`Thumbnail for "${item.name}" is ${asset.sizeKB} KB, above the ${this.settings.thumbnailMaxKB} KB limit`);
		}

		return toNoteRelativePath(notePath, asset.vaultPath);
	}

	private async saveToTempLocation(file: File): Promise<TempFileHandle> {
		const tempDirPath = TEMP_DIR;

		const adapter = this.app.vault.adapter;
		const tempDirExists = await adapter.exists(tempDirPath);
		if (!tempDirExists) {
			await adapter.mkdir(tempDirPath);
		}

		const timestamp = Date.now();
		const filename = `${timestamp}-${file.name}`;
		const tempFilePath = `${tempDirPath}/${filename}`;

		const buffer = await file.arrayBuffer();
		const uint8Array = new Uint8Array(buffer);
		await adapter.writeBinary(tempFilePath, uint8Array);

		return { absolutePath: this.getAbsolutePath(tempFilePath), vaultPath: tempFilePath };
	}

	/** Eagle copies imports into its own library, so the staging file is redundant. */
	private async removeTempFile(temp: TempFileHandle): Promise<void> {
		if (!this.settings.deleteTempAfterImport) return;

		try {
			await this.app.vault.adapter.remove(temp.vaultPath);
		} catch (error) {
			console.error('[CMDS Eagle] Failed to remove staged copy:', temp.vaultPath, error);
			new Notice(`Could not remove the staged copy at ${temp.vaultPath} — delete it manually`);
		}
	}

	private getVaultPath(): string {
		const adapter = this.app.vault.adapter as { basePath?: string };
		if (adapter.basePath) {
			return adapter.basePath;
		}
		const configDir = this.app.vault.configDir;
		const sep = configDir.lastIndexOf('/');
		return sep > 0 ? configDir.slice(0, sep) : configDir;
	}

	private getAbsolutePath(relativePath: string): string {
		const vaultPath = this.getVaultPath();
		if (relativePath.startsWith('/')) {
			return relativePath;
		}
		return `${vaultPath}/${relativePath}`;
	}

	private allFilesAreImages(files: FileList): boolean {
		if (!files || files.length === 0) return false;
		
		const imageTypes = [
			'image/jpeg',
			'image/jpg',
			'image/png',
			'image/gif',
			'image/webp',
			'image/bmp',
			'image/svg+xml',
			'image/tiff',
			'image/heic',
			'image/heif',
			'image/avif',
		];
		
		for (const file of Array.from(files)) {
			if (!imageTypes.includes(file.type)) {
				return false;
			}
		}
		return true;
	}

	private async pathExists(absolutePath: string): Promise<boolean> {
		try {
			await fsp.stat(absolutePath);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Rewrites the `file://` embeds of a note so they resolve on this computer.
	 * A target that is not on disk — an unmounted NAS — is left alone: writing an
	 * unreachable path into the note would outlive the disconnection, and the
	 * original at least still resolves on the machine that recorded it.
	 */
	private async rewriteNoteFileUrls(file: TFile): Promise<{ converted: number; skipped: number }> {
		const content = await this.app.vault.read(file);
		const fileUrlRegex = /!\[([^\]]*)\]\((file:\/\/[^)]+)\)/g;

		let newContent = content;
		let converted = 0;
		let skipped = 0;
		let match;

		while ((match = fileUrlRegex.exec(content)) !== null) {
			const originalUrl = match[2];
			const filePath = fileUrlToPath(originalUrl);
			if (!filePath) continue;

			const convertedPath = remapPathToComputer(
				filePath,
				this.settings.computers,
				this.getCurrentComputer()
			);
			if (!convertedPath) continue;

			if (!(await this.pathExists(convertedPath))) {
				skipped++;
				continue;
			}

			newContent = newContent.replace(originalUrl, pathToFileUrl(convertedPath));
			converted++;
		}

		if (converted > 0) {
			await this.app.vault.modify(file, newContent);
		}
		return { converted, skipped };
	}

	private async convertCrossPlatformPaths(): Promise<void> {
		if (!this.settings.enableCrossPlatform) {
			new Notice('Cross-platform sync is disabled in settings');
			return;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active file');
			return;
		}

		const { converted, skipped } = await this.rewriteNoteFileUrls(activeFile);
		if (converted > 0) {
			new Notice(`Converted ${converted} cross-platform image paths`);
		} else if (skipped > 0) {
			new Notice(`${skipped} path(s) point at a library that is not mounted — left unchanged`);
		} else {
			new Notice('No cross-platform paths found to convert');
		}
	}

	private async autoConvertOnFileOpen(file: TFile): Promise<void> {
		const { converted, skipped } = await this.rewriteNoteFileUrls(file);
		if (converted > 0) {
			new Notice(`Auto-converted ${converted} cross-platform paths`);
		} else if (skipped > 0) {
			console.log(`[CMDS Eagle] Left ${skipped} path(s) unchanged — library not mounted`);
		}
	}

	/** Every element that can hold a rendered image, across reading view and live preview. */
	private activeViewContainers(view: MarkdownView): HTMLElement[] {
		return [
			view.contentEl,
			view.containerEl,
			activeDocument.querySelector('.workspace-leaf.mod-active .view-content'),
			activeDocument.querySelector('.workspace-leaf.mod-active .markdown-preview-view'),
			activeDocument.querySelector('.workspace-leaf.mod-active .cm-content'),
		].filter(Boolean) as HTMLElement[];
	}

	private convertRenderedImages(view: MarkdownView): number {
		let convertedCount = 0;
		for (const container of this.activeViewContainers(view)) {
			container.querySelectorAll('img').forEach((img) => {
				if (this.convertImageSrcForRendering(img)) convertedCount++;
			});
		}
		return convertedCount;
	}

	private convertCrossPlatformRenderOnly(): void {
		if (!this.settings.enableCrossPlatform) {
			new Notice('Cross-platform sync is disabled in settings');
			return;
		}

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice('No active markdown view');
			return;
		}

		const convertedCount = this.convertRenderedImages(view);
		if (convertedCount > 0) {
			new Notice(`Render-only: converted ${convertedCount} image paths (source unchanged)`);
		} else {
			new Notice('No cross-platform paths found to convert');
		}
	}

	private autoConvertRenderOnlyOnFileOpen(): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		const convertedCount = this.convertRenderedImages(view);
		if (convertedCount > 0) {
			console.log(`[CMDS Eagle] Auto render-only: converted ${convertedCount} paths`);
		}
	}

	private async uploadAllImagesToCloud(): Promise<void> {
		const provider = this.getActiveCloudProvider();
		if (!provider) {
			new Notice('No cloud provider configured. Check settings.');
			return;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active file');
			return;
		}

		const content = await this.app.vault.read(activeFile);
		const providerName = this.getActiveCloudProviderName();
		
		const imageMatches: { full: string; alt: string; url: string; filePath?: string }[] = [];
		
		const fileUrlRegex = /!\[([^\]]*)\]\((file:\/\/[^)]+)\)/gi;
		let match;
		while ((match = fileUrlRegex.exec(content)) !== null) {
			const url = match[2];
			const filePath = decodeURIComponent(url.replace('file://', ''));
			imageMatches.push({
				full: match[0],
				alt: match[1],
				url: url,
				filePath: filePath,
			});
		}
		
		const localhostRegex = /!\[([^\]]*)\]\((https?:\/\/localhost:\d+\/api\/item\/thumbnail\?id=([A-Z0-9]+))\)/gi;
		while ((match = localhostRegex.exec(content)) !== null) {
			const itemId = match[3];
			const item = await this.api.getItemInfo(itemId);
			if (item) {
				const filePath = await this.api.getOriginalFilePath(item);
				if (filePath) {
					imageMatches.push({
						full: match[0],
						alt: match[1],
						url: match[2],
						filePath: filePath,
					});
				}
			}
		}
		
		const localImageRegex = /!\[([^\]]*)\]\((?!https?:\/\/|file:\/\/)([^)]+\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff|tif|heic|heif|avif|ico|mp4|mov))\)/gi;
		while ((match = localImageRegex.exec(content)) !== null) {
			const relativePath = match[2];
			const absolutePath = this.getAbsolutePath(relativePath);
			imageMatches.push({
				full: match[0],
				alt: match[1],
				url: relativePath,
				filePath: absolutePath,
			});
		}

		if (imageMatches.length === 0) {
			new Notice('No local images found in current note');
			return;
		}

		new Notice(`Found ${imageMatches.length} images. Uploading to ${providerName}...`);

		let uploaded = 0;
		let newContent = content;

		for (const img of imageMatches) {
			if (!img.filePath) continue;
			
			if (img.url.startsWith('http://') || img.url.startsWith('https://')) {
				if (!img.url.includes('localhost')) continue;
			}
			
			const filename = img.filePath.split('/').pop() || 'image';
			const ext = getExtFromFilename(filename);
			const mimeType = getMimeType(ext);

			try {
				const result = await provider.upload(img.filePath, filename, mimeType);
				if (result.success && result.publicUrl) {
					newContent = newContent.replace(img.url, result.publicUrl);
					uploaded++;
				}
			} catch (error) {
				console.error(`Failed to upload ${filename}:`, error);
			}
		}

		if (newContent !== content) {
			await this.app.vault.modify(activeFile, newContent);
		}

		new Notice(`Uploaded ${uploaded}/${imageMatches.length} images to ${providerName}`);
	}
}
