import {
	Plugin,
	MarkdownView,
	Notice,
	Editor,
	TFile,
	Menu,
	EditorPosition,
	TAbstractFile,
} from 'obsidian';
import {
	CMDSPACEEagleSettings,
	DEFAULT_SETTINGS,
	EagleItem,
	ImagePasteBehavior,
	ComputerProfile,
	PlatformType,
} from './types';
import { 
	EagleApiService, 
	buildEagleItemUrl, 
	parseEagleUrl, 
	hasR2Upload,
	parseEagleLocalhostUrl,
	isEagleLocalhostUrl,
	buildEagleLocalhostThumbnailUrl,
} from './api';
import { EagleSearchModal, ImagePasteChoiceModal } from './modals';
import { CMDSPACEEagleSettingTab } from './settings';
import { createCloudProvider, getMimeType, getExtFromFilename, CloudProvider } from './cloud-providers';

export default class CMDSPACELinkEagle extends Plugin {
	settings: CMDSPACEEagleSettings;
	api: EagleApiService;
	private lastModifiedFile: string | null = null;

	async onload(): Promise<void> {
		console.log('[CMDS Eagle] Loading plugin v1.5.0');

		await this.loadSettings();
		this.api = new EagleApiService(this.settings);

		this.addCommand({
			id: 'search-eagle',
			name: 'Search Eagle library and embed',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				new EagleSearchModal(this.app, this.api, this.settings).open();
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
				await this.convertCrossPlatformPaths();
			},
		});

		this.registerEvent(
			this.app.workspace.on('editor-paste', async (evt: ClipboardEvent, editor: Editor) => {
				await this.handlePaste(evt, editor);
			})
		);

		this.registerEvent(
			this.app.workspace.on('editor-drop', async (evt: DragEvent, editor: Editor) => {
				await this.handleDrop(evt, editor);
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

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				setTimeout(() => this.processActiveView(), 100);
			})
		);

		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				setTimeout(() => this.processActiveView(), 100);
			})
		);

		this.registerEvent(
			this.app.vault.on('modify', (file: TAbstractFile) => {
				this.lastModifiedFile = file.path;
			})
		);

		this.registerEvent(
			this.app.workspace.on('file-open', (file: TFile | null) => {
				if (file && this.settings.enableCrossPlatform && this.settings.autoConvertCrossPlatformPaths) {
					if (this.lastModifiedFile !== file.path) {
						setTimeout(() => this.autoConvertOnFileOpen(file), 200);
					}
				}
			})
		);

		this.addRibbonIcon('image', 'CMDSPACE: Eagle', () => {
			new EagleSearchModal(this.app, this.api, this.settings).open();
		});
	}

	onunload(): void {
		console.log('[CMDS Eagle] Unloading plugin');
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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

		this.insertItemLink(editor, item);
		new Notice(`Inserted link to: ${item.name}`);
	}

	private async insertItemLink(editor: Editor, item: EagleItem): Promise<void> {
		if (this.settings.insertAsEmbed) {
			const filePath = await this.api.getOriginalFilePath(item);
			if (filePath) {
				const fileUrl = this.pathToFileUrl(filePath);
				const filename = `${item.name}.${item.ext}`;
				let output = `![${filename}](${fileUrl})`;
				
				if (this.settings.insertThumbnail) {
					output += '\n\n' + this.buildMetadataCard(item);
				}
				
				editor.replaceSelection(output);
				return;
			}
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

	private buildMetadataCard(item: EagleItem): string {
		const linkUrl = buildEagleItemUrl(item.id);
		const tags = item.tags
			.filter(t => !t.startsWith('r2:') && t !== 'r2-cloud' && t !== 'cloud-upload')
			.map(t => `#${this.normalizeTag(t)}`)
			.join(' ');
		const dimensions = item.width && item.height ? `${item.width}×${item.height}` : 'N/A';
		const isUploaded = hasR2Upload(item);
		const cloudUrl = this.api.getCloudUrl(item);

		let linkSection = `[Open in Eagle](${linkUrl})`;
		if (cloudUrl) {
			linkSection += ` | [Cloud](${cloudUrl})`;
		}

		return `> **${item.ext.toUpperCase()}** | ${this.formatFileSize(item.size)} | ${dimensions} | ${isUploaded ? '☁️' : '📁'} | ${tags || 'No tags'}
> ${linkSection}`;
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
		const localUrl = this.api.getLocalThumbnailUrl(item.id);
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

		await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
			const existingTags = frontmatter.tags || [];
			const newTags = [...new Set([...existingTags, ...allTags])];
			frontmatter.tags = newTags;
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
		const success = await this.api.addFromUrl({
			url: clipboardText,
			name,
			folderId: this.settings.defaultFolder || undefined,
		});

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
		return;
	}

	private tryConvertImagePath(img: HTMLImageElement): void {
		const src = img.getAttribute('src');
		if (!src) return;
		
		const alreadyConverted = img.getAttribute('data-original-src');
		if (alreadyConverted) return;

		console.log(`[CMDS Eagle] Checking image src: ${src}`);

		let extractedPath: string | null = null;
		
		if (src.startsWith('file://')) {
			extractedPath = this.fullyDecodeUri(src.replace(/^file:\/\/\/?/, ''));
		} else if (src.startsWith('app://')) {
			const appMatch = src.match(/^app:\/\/[^/]+\/(.+)$/);
			if (appMatch) {
				extractedPath = this.fullyDecodeUri(appMatch[1]);
			}
		}

		if (!extractedPath) {
			console.log(`[CMDS Eagle] No extractable path`);
			return;
		}

		console.log(`[CMDS Eagle] Extracted: ${extractedPath}`);

		if (extractedPath.startsWith('Users/') && !extractedPath.startsWith('/')) {
			extractedPath = '/' + extractedPath;
		}

		const isDifferent = this.isPathFromDifferentPlatform(extractedPath);
		console.log(`[CMDS Eagle] Is from different platform: ${isDifferent}`);
		
		if (!isDifferent) return;

		const convertedPath = this.convertPathForCurrentPlatform(extractedPath);
		
		if (convertedPath !== extractedPath) {
			const newSrc = this.pathToFileUrl(convertedPath);
			console.log(`[CMDS Eagle] Setting new src: ${newSrc}`);
			
			const newImg = document.createElement('img');
			newImg.src = newSrc;
			newImg.alt = img.alt;
			newImg.className = img.className;
			newImg.setAttribute('data-original-src', src);
			newImg.setAttribute('data-xplatform-replaced', 'true');
			
			if (img.parentNode) {
				img.parentNode.replaceChild(newImg, img);
				console.log(`[CMDS Eagle] Image element replaced`);
			}
		}
	}

	private isPathFromDifferentPlatform(path: string): boolean {
		const currentPlatform = this.getCurrentPlatform();
		const currentUsername = this.getCurrentUsername();
		
		for (const computer of this.settings.computers) {
			if (computer.platform === currentPlatform && computer.username === currentUsername) {
				continue;
			}
			
			if (computer.platform === 'darwin') {
				if (path.includes(`/Users/${computer.username}/`)) {
					return true;
				}
			} else if (computer.platform === 'win32') {
				const winPattern = new RegExp(`[A-Za-z]:[/\\\\]Users[/\\\\]${computer.username}[/\\\\]`, 'i');
				if (winPattern.test(path)) {
					return true;
				}
			}
		}
		return false;
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
		return;
	}

	private fullyDecodeUri(str: string): string {
		let decoded = str;
		try {
			while (decoded.includes('%')) {
				const next = decodeURIComponent(decoded);
				if (next === decoded) break;
				decoded = next;
			}
		} catch {
			return str;
		}
		return decoded;
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

	private async handlePaste(evt: ClipboardEvent, editor: Editor): Promise<void> {
		const clipboardData = evt.clipboardData;
		if (!clipboardData) return;

		const text = clipboardData.getData('text/plain').trim();
		
		if (isEagleLocalhostUrl(text)) {
			evt.preventDefault();
			await this.handleEagleLocalhostUrlPaste(text, editor);
			return;
		}

		if (this.isEagleLibraryPath(text)) {
			evt.preventDefault();
			await this.handleEagleLibraryPathPaste(text, editor);
			return;
		}

		const { files } = clipboardData;
		if (!files || !this.allFilesAreImages(files)) return;

		if (this.settings.imagePasteBehavior === 'local') {
			return;
		}

		evt.preventDefault();

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
			this.settings.imagePasteBehavior = response.choice as ImagePasteBehavior;
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

	private async handleDrop(evt: DragEvent, editor: Editor): Promise<void> {
		const { files } = evt.dataTransfer || { files: null };
		if (!files || !this.allFilesAreImages(files)) return;

		if (this.settings.imagePasteBehavior === 'local') {
			return;
		}

		evt.preventDefault();

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
			this.settings.imagePasteBehavior = response.choice as ImagePasteBehavior;
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
			let targetPath: string;
			
			if (attachmentFolder === './') {
				const parentFolder = activeFile.parent?.path || '';
				targetPath = parentFolder ? `${parentFolder}/${filename}` : filename;
			} else if (attachmentFolder.startsWith('./')) {
				const parentFolder = activeFile.parent?.path || '';
				const relativeFolder = attachmentFolder.slice(2);
				targetPath = parentFolder ? `${parentFolder}/${relativeFolder}/${filename}` : `${relativeFolder}/${filename}`;
			} else if (attachmentFolder) {
				targetPath = `${attachmentFolder}/${filename}`;
			} else {
				targetPath = filename;
			}

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
			const imageUrl = await this.uploadImageToEagle(file);
			const markdownImage = `![${file.name}](${imageUrl})`;
			this.replaceTextInDocument(editor, placeholderText, markdownImage);
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
			const tempPath = await this.saveToTempLocation(file);
			const ext = getExtFromFilename(file.name);
			const mimeType = getMimeType(ext);
			
			const result = await provider.upload(tempPath, file.name, mimeType);
			
			if (result.success && result.publicUrl) {
				const markdownImage = `![${file.name}](${result.publicUrl})`;
				this.replaceTextInDocument(editor, placeholderText, markdownImage);
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
			
			const result = await this.api.addFromPath({
				path: absolutePath,
				name: filenameWithoutExt,
				folderId: this.settings.defaultFolder || undefined,
			});

			if (!result.success || !result.itemId) {
				throw new Error('Failed to add image to Eagle');
			}

			await this.delay(1000);

			const thumbnailPath = await this.api.getThumbnailPath(result.itemId);
			const imageUrl = thumbnailPath ? `file://${thumbnailPath}` : `eagle://item/${result.itemId}`;
			
			const markdownImage = `![${file.basename}](${imageUrl})`;
			this.replaceTextInDocument(editor, placeholderText, markdownImage);
			
			new Notice(`Uploaded to Eagle: ${file.name}`);
			
			await this.offerToReplaceOtherReferences(file, imageUrl, { line: startPos.line, ch: startPos.ch });
			
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			this.replaceTextInDocument(editor, placeholderText, originalText);
			new Notice(`Failed to upload: ${errorMessage}`);
		}
	}

	private async offerToReplaceOtherReferences(
		originalFile: TFile,
		newUrl: string,
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

		await this.replaceAllReferences(filteredRefs, originalFile, newUrl);
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
			noticeEl.style.cursor = 'pointer';
			noticeEl.onclick = () => {
				notice.hide();
				resolve(true);
			};
			
			setTimeout(() => resolve(false), 10000);
		});
	}

	private async replaceAllReferences(
		references: { notePath: string; positions: { line: number; ch: number; text: string }[] }[],
		originalFile: TFile,
		newUrl: string
	): Promise<void> {
		for (const ref of references) {
			const file = this.app.vault.getAbstractFileByPath(ref.notePath);
			if (!(file instanceof TFile)) continue;

			let content = await this.app.vault.read(file);
			
			const sortedPositions = [...ref.positions].sort((a, b) => {
				if (a.line !== b.line) return b.line - a.line;
				return b.ch - a.ch;
			});

			for (const pos of sortedPositions) {
				const newMarkdown = `![${originalFile.basename}](${newUrl})`;
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
		const normalizedPath = path.replace(/\\/g, '/');
		const filename = normalizedPath.split('/').pop() || 'image';
		const fileUrl = this.pathToFileUrl(normalizedPath);
		const markdown = `![${filename}](${fileUrl})`;
		editor.replaceSelection(markdown);
		new Notice(`Embedded: ${filename}`);
	}

	private async getEagleItemFilePath(itemId: string, name: string, ext: string): Promise<string | null> {
		const thumbnailPath = await this.api.getThumbnailPath(itemId);
		if (!thumbnailPath) return null;

		const decodedPath = this.safeDecodeUri(thumbnailPath);
		const folderPath = decodedPath.substring(0, decodedPath.lastIndexOf('/'));
		const originalFileName = `${name}.${ext}`;
		return `${folderPath}/${originalFileName}`;
	}

	private safeDecodeUri(str: string): string {
		try {
			return decodeURIComponent(str);
		} catch {
			return str;
		}
	}

	private pathToFileUrl(path: string): string {
		let decodedPath = path;
		try {
			while (decodedPath.includes('%')) {
				const decoded = decodeURIComponent(decodedPath);
				if (decoded === decodedPath) break;
				decodedPath = decoded;
			}
		} catch {
			decodedPath = path;
		}

		const convertedPath = this.convertPathForCurrentPlatform(decodedPath);
		const normalizedPath = convertedPath.replace(/\\/g, '/');
		const encodedPath = normalizedPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
		
		if (this.getCurrentPlatform() === 'win32' && /^[A-Za-z]:/.test(normalizedPath)) {
			// Fix: restore drive letter colon that was encoded as %3A
			const fixedPath = encodedPath.replace(/^([A-Za-z])%3A/, '$1:');
			return `file:///${fixedPath}`;
		}
		return `file://${encodedPath}`;
	}

	private getCurrentPlatform(): PlatformType {
		return process.platform as PlatformType;
	}

	private getCurrentUsername(): string {
		const platform = this.getCurrentPlatform();
		const vaultPath = this.getVaultPath();
		
		if (platform === 'darwin') {
			const match = vaultPath.match(/^\/Users\/([^/]+)/);
			if (match) return match[1];
		} else if (platform === 'win32') {
			const match = vaultPath.match(/^[A-Za-z]:[/\\]Users[/\\]([^/\\]+)/i);
			if (match) return match[1];
		}
		
		return '';
	}

	private findMatchingComputer(path: string): ComputerProfile | null {
		if (!this.settings.enableCrossPlatform || this.settings.computers.length === 0) {
			return null;
		}

		for (const computer of this.settings.computers) {
			if (computer.platform === 'darwin') {
				const macPattern = `/Users/${computer.username}/`;
				if (path.includes(macPattern)) {
					return computer;
				}
			} else if (computer.platform === 'win32') {
				const winPattern = new RegExp(`^[A-Za-z]:[/\\\\]Users[/\\\\]${computer.username}[/\\\\]`, 'i');
				if (winPattern.test(path)) {
					return computer;
				}
			}
		}
		
		console.log('[CMDS Eagle] No computer matched path:', path.substring(0, 50));
		return null;
	}

	private convertPathForCurrentPlatform(path: string): string {
		if (!this.settings.enableCrossPlatform || this.settings.computers.length === 0) {
			return path;
		}

		const sourceComputer = this.findMatchingComputer(path);
		if (!sourceComputer) {
			console.log('[CMDS Eagle] No matching computer found for path');
			return path;
		}

		const currentPlatform = this.getCurrentPlatform();
		const currentUsername = this.getCurrentUsername();

		const currentComputer = this.settings.computers.find(
			c => c.platform === currentPlatform && c.username === currentUsername
		);

		if (!currentComputer || sourceComputer.id === currentComputer.id) {
			return path;
		}

		console.log(`[CMDS Eagle] Converting: ${sourceComputer.platform}/${sourceComputer.username} → ${currentComputer.platform}/${currentComputer.username}`);

		let relativePath = '';
		if (sourceComputer.platform === 'darwin') {
			relativePath = path.replace(`/Users/${sourceComputer.username}/`, '');
		} else {
			const winPattern = new RegExp(`[A-Za-z]:[/\\\\]Users[/\\\\]${sourceComputer.username}[/\\\\]`, 'i');
			relativePath = path.replace(winPattern, '').replace(/\\/g, '/');
		}

		if (currentComputer.platform === 'darwin') {
			return `/Users/${currentComputer.username}/${relativePath}`;
		} else {
			return `C:/Users/${currentComputer.username}/${relativePath}`;
		}
	}

	private async uploadImageToEagle(file: File): Promise<string> {
		const tempPath = await this.saveToTempLocation(file);
		
		const connected = await this.api.isConnected();
		if (!connected) {
			throw new Error('Eagle is not running');
		}

		const filenameWithoutExt = file.name.replace(/\.[^.]+$/, '');
		const result = await this.api.addFromPath({
			path: tempPath,
			name: filenameWithoutExt,
			folderId: this.settings.defaultFolder || undefined,
		});

		if (!result.success || !result.itemId) {
			throw new Error('Failed to add image to Eagle');
		}

		await this.delay(1000);

		const thumbnailPath = await this.api.getThumbnailPath(result.itemId);
		
		return thumbnailPath ? `file://${thumbnailPath}` : `file://${tempPath}`;
	}

	private async saveToTempLocation(file: File): Promise<string> {
		const tempDir = '.eagle-temp';
		const tempDirPath = `${tempDir}`;

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

		return this.getAbsolutePath(tempFilePath);
	}

	private getVaultPath(): string {
		const adapter = this.app.vault.adapter as { basePath?: string };
		if (adapter.basePath) {
			return adapter.basePath;
		}
		const configDir = this.app.vault.configDir;
		return configDir.replace('/.obsidian', '');
	}

	private getAbsolutePath(relativePath: string): string {
		const vaultPath = this.getVaultPath();
		if (relativePath.startsWith('/')) {
			return relativePath;
		}
		return `${vaultPath}/${relativePath}`;
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
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

		const content = await this.app.vault.read(activeFile);
		let newContent = content;
		let convertedCount = 0;

		const fileUrlRegex = /!\[([^\]]*)\]\((file:\/\/[^)]+)\)/g;
		let match;
		
		while ((match = fileUrlRegex.exec(content)) !== null) {
			const originalUrl = match[2];
			let filePath = this.fullyDecodeUri(originalUrl.replace(/^file:\/\/\/?/, ''));
			
			if (filePath.startsWith('Users/') && !filePath.startsWith('/')) {
				filePath = '/' + filePath;
			}

			if (this.isPathFromDifferentPlatform(filePath)) {
				const convertedPath = this.convertPathForCurrentPlatform(filePath);
				const newUrl = this.pathToFileUrl(convertedPath);
				newContent = newContent.replace(originalUrl, newUrl);
				convertedCount++;
				console.log(`[CMDS Eagle] File converted: ${originalUrl.substring(0, 50)}... → ${newUrl.substring(0, 50)}...`);
			}
		}

		if (convertedCount > 0) {
			await this.app.vault.modify(activeFile, newContent);
			new Notice(`Converted ${convertedCount} cross-platform image paths`);
		} else {
			new Notice('No cross-platform paths found to convert');
		}
	}

	private async autoConvertOnFileOpen(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);
		let newContent = content;
		let convertedCount = 0;

		const fileUrlRegex = /!\[([^\]]*)\]\((file:\/\/[^)]+)\)/g;
		let match;
		
		while ((match = fileUrlRegex.exec(content)) !== null) {
			const originalUrl = match[2];
			let filePath = this.fullyDecodeUri(originalUrl.replace(/^file:\/\/\/?/, ''));
			
			if (filePath.startsWith('Users/') && !filePath.startsWith('/')) {
				filePath = '/' + filePath;
			}

			if (this.isPathFromDifferentPlatform(filePath)) {
				const convertedPath = this.convertPathForCurrentPlatform(filePath);
				const newUrl = this.pathToFileUrl(convertedPath);
				newContent = newContent.replace(originalUrl, newUrl);
				convertedCount++;
			}
		}

		if (convertedCount > 0) {
			await this.app.vault.modify(file, newContent);
			new Notice(`Auto-converted ${convertedCount} cross-platform paths`);
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
