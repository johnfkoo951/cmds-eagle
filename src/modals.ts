import {
	App,
	FuzzySuggestModal,
	FuzzyMatch,
	Notice,
	MarkdownView,
	Modal,
	Setting,
} from 'obsidian';
import { 
	EagleItem, 
	CMDSPACEEagleSettings, 
	ImagePasteBehavior,
	SearchScope,
	SUPPORTED_IMAGE_EXTENSIONS,
	SUPPORTED_VIDEO_EXTENSIONS,
	SUPPORTED_DOCUMENT_EXTENSIONS,
} from './types';
import { EagleApiService, buildEagleItemUrl } from './api';

type FileTypeCategory = 'images' | 'videos' | 'documents' | 'all';

export class EagleSearchModal extends FuzzySuggestModal<EagleItem> {
	private api: EagleApiService;
	private settings: CMDSPACEEagleSettings;
	private allItems: EagleItem[] = [];
	private isLoading = false;
	private activeScopes: Set<SearchScope>;
	private activeFileTypes: Set<string>;
	private filterContainer: HTMLElement | null = null;
	private libraryNameEl: HTMLElement | null = null;

	constructor(app: App, api: EagleApiService, settings: CMDSPACEEagleSettings) {
		super(app);
		this.api = api;
		this.settings = settings;
		this.activeScopes = new Set(settings.searchScope);
		this.activeFileTypes = new Set(settings.searchFileTypes);
		this.setPlaceholder('Search Eagle items...');
		this.setInstructions([
			{ command: '↑↓', purpose: 'navigate' },
			{ command: '↵', purpose: 'insert link' },
			{ command: 'esc', purpose: 'dismiss' },
		]);
	}

	async onOpen(): Promise<void> {
		super.onOpen();
		this.buildFilterUI();
		await this.loadItems();
	}

	private buildFilterUI(): void {
		const promptEl = this.modalEl.querySelector('.prompt');
		if (!promptEl) return;

		this.filterContainer = createDiv({ cls: 'cmdspace-eagle-filters' });
		promptEl.insertBefore(this.filterContainer, promptEl.firstChild);

		const headerRow = this.filterContainer.createDiv({ cls: 'cmdspace-eagle-filter-header' });
		this.libraryNameEl = headerRow.createSpan({ cls: 'cmdspace-eagle-library-name', text: 'Loading...' });

		const scopeRow = this.filterContainer.createDiv({ cls: 'cmdspace-eagle-filter-row' });
		scopeRow.createSpan({ text: 'Search in:', cls: 'cmdspace-eagle-filter-label' });
		
		const scopeButtons = scopeRow.createDiv({ cls: 'cmdspace-eagle-filter-buttons' });
		this.createScopeButton(scopeButtons, 'name', 'Name');
		this.createScopeButton(scopeButtons, 'tags', 'Tags');
		this.createScopeButton(scopeButtons, 'annotation', 'Notes');
		this.createScopeButton(scopeButtons, 'folders', 'Folders');

		const typeRow = this.filterContainer.createDiv({ cls: 'cmdspace-eagle-filter-row' });
		typeRow.createSpan({ text: 'File types:', cls: 'cmdspace-eagle-filter-label' });
		
		const typeButtons = typeRow.createDiv({ cls: 'cmdspace-eagle-filter-buttons' });
		this.createTypeButton(typeButtons, 'images', 'Images');
		this.createTypeButton(typeButtons, 'videos', 'Videos');
		this.createTypeButton(typeButtons, 'documents', 'Docs');
		this.createTypeButton(typeButtons, 'all', 'All');
	}

	private createScopeButton(container: HTMLElement, scope: SearchScope, label: string): void {
		const btn = container.createEl('button', { 
			text: label,
			cls: `cmdspace-eagle-filter-btn ${this.activeScopes.has(scope) ? 'is-active' : ''}`
		});
		btn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (this.activeScopes.has(scope)) {
				if (this.activeScopes.size > 1) {
					this.activeScopes.delete(scope);
					btn.removeClass('is-active');
				}
			} else {
				this.activeScopes.add(scope);
				btn.addClass('is-active');
			}
			this.inputEl.dispatchEvent(new Event('input'));
		});
	}

	private createTypeButton(container: HTMLElement, category: FileTypeCategory, label: string): void {
		const isActive = this.isTypeCategoryActive(category);
		const btn = container.createEl('button', { 
			text: label,
			cls: `cmdspace-eagle-filter-btn ${isActive ? 'is-active' : ''}`
		});
		btn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.toggleTypeCategory(category);
			this.updateTypeButtonStates(container.parentElement!);
			this.inputEl.dispatchEvent(new Event('input'));
		});
	}

	private isTypeCategoryActive(category: FileTypeCategory): boolean {
		const extensions = this.getExtensionsForCategory(category);
		return extensions.some(ext => this.activeFileTypes.has(ext));
	}

	private getExtensionsForCategory(category: FileTypeCategory): readonly string[] {
		switch (category) {
			case 'images': return SUPPORTED_IMAGE_EXTENSIONS;
			case 'videos': return SUPPORTED_VIDEO_EXTENSIONS;
			case 'documents': return SUPPORTED_DOCUMENT_EXTENSIONS;
			case 'all': return [...SUPPORTED_IMAGE_EXTENSIONS, ...SUPPORTED_VIDEO_EXTENSIONS, ...SUPPORTED_DOCUMENT_EXTENSIONS];
		}
	}

	private toggleTypeCategory(category: FileTypeCategory): void {
		const extensions = this.getExtensionsForCategory(category);
		const isCurrentlyActive = this.isTypeCategoryActive(category);

		if (category === 'all') {
			if (isCurrentlyActive) {
				this.activeFileTypes = new Set(SUPPORTED_IMAGE_EXTENSIONS);
			} else {
				this.activeFileTypes = new Set([
					...SUPPORTED_IMAGE_EXTENSIONS,
					...SUPPORTED_VIDEO_EXTENSIONS,
					...SUPPORTED_DOCUMENT_EXTENSIONS
				]);
			}
		} else {
			if (isCurrentlyActive) {
				extensions.forEach(ext => this.activeFileTypes.delete(ext));
				if (this.activeFileTypes.size === 0) {
					SUPPORTED_IMAGE_EXTENSIONS.forEach(ext => this.activeFileTypes.add(ext));
				}
			} else {
				extensions.forEach(ext => this.activeFileTypes.add(ext));
			}
		}
	}

	private updateTypeButtonStates(typeRow: HTMLElement): void {
		const buttons = typeRow.querySelectorAll('.cmdspace-eagle-filter-btn');
		const categories: FileTypeCategory[] = ['images', 'videos', 'documents', 'all'];
		buttons.forEach((btn, idx) => {
			if (this.isTypeCategoryActive(categories[idx])) {
				btn.addClass('is-active');
			} else {
				btn.removeClass('is-active');
			}
		});
	}

	private async loadItems(): Promise<void> {
		if (this.isLoading) return;
		
		this.isLoading = true;
		try {
			const connected = await this.api.isConnected();
			if (!connected) {
				new Notice('Eagle is not running. Please start Eagle and try again.');
				this.close();
				return;
			}

			const libraryName = await this.api.getLibraryName();
			if (this.libraryNameEl && libraryName) {
				this.libraryNameEl.setText(`📚 ${libraryName}`);
			}

			this.allItems = await this.api.listItems();
			
			if (this.libraryNameEl) {
				const count = this.allItems.length;
				const libraryText = libraryName ? `📚 ${libraryName}` : '📚 Eagle';
				this.libraryNameEl.setText(`${libraryText} (${count.toLocaleString()} items)`);
			}
			
			this.inputEl.dispatchEvent(new Event('input'));
		} catch (error) {
			console.error('Failed to load Eagle items:', error);
			new Notice('Failed to load Eagle items. Check console for details.');
		} finally {
			this.isLoading = false;
		}
	}

	getItems(): EagleItem[] {
		return this.allItems.filter(item => 
			this.activeFileTypes.has(item.ext.toLowerCase())
		);
	}

	getItemText(item: EagleItem): string {
		const parts: string[] = [];
		
		if (this.activeScopes.has('name')) {
			parts.push(item.name);
		}
		if (this.activeScopes.has('tags') && item.tags.length > 0) {
			parts.push(item.tags.join(' '));
		}
		if (this.activeScopes.has('annotation') && item.annotation) {
			parts.push(item.annotation);
		}
		if (this.activeScopes.has('folders') && item.folders.length > 0) {
			parts.push(item.folders.join('/'));
		}
		
		return parts.join(' ') || item.name;
	}

	renderSuggestion(match: FuzzyMatch<EagleItem>, el: HTMLElement): void {
		const item = match.item;
		
		const container = el.createDiv({ cls: 'cmdspace-eagle-suggestion' });
		const infoDiv = container.createDiv({ cls: 'cmdspace-eagle-suggestion-info' });
		infoDiv.createDiv({ cls: 'cmdspace-eagle-suggestion-name', text: item.name });
		
		const metaDiv = infoDiv.createDiv({ cls: 'cmdspace-eagle-suggestion-meta' });
		metaDiv.createSpan({ text: item.ext.toUpperCase() });
		metaDiv.createSpan({ text: ' • ' });
		metaDiv.createSpan({ text: this.formatFileSize(item.size) });
		if (item.width && item.height) {
			metaDiv.createSpan({ text: ' • ' });
			metaDiv.createSpan({ text: `${item.width}×${item.height}` });
		}
		
		if (item.tags.length > 0) {
			const tagsDiv = infoDiv.createDiv({ cls: 'cmdspace-eagle-suggestion-tags' });
			item.tags.slice(0, 5).forEach(tag => {
				tagsDiv.createSpan({ cls: 'cmdspace-eagle-tag', text: tag });
			});
			if (item.tags.length > 5) {
				tagsDiv.createSpan({ cls: 'cmdspace-eagle-tag-more', text: `+${item.tags.length - 5}` });
			}
		}
	}

	onChooseItem(item: EagleItem, evt: MouseEvent | KeyboardEvent): void {
		this.insertItemLink(item);
	}

	private async insertItemLink(item: EagleItem): Promise<void> {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
			new Notice('No active markdown editor');
			return;
		}

		const editor = activeView.editor;
		
		if (this.settings.insertAsEmbed) {
			const filePath = await this.api.getOriginalFilePath(item);
			if (filePath) {
				const fileUrl = this.pathToFileUrl(filePath);
				const filename = `${item.name}.${item.ext}`;
				let output = `![${filename}](${fileUrl})`;
				
				if (this.settings.insertThumbnail) {
					output += '\n\n' + this.buildMetadataLine(item);
				}
				
				editor.replaceSelection(output);
				new Notice(`Embedded: ${item.name}`);
				return;
			}
		}

		const linkUrl = buildEagleItemUrl(item.id);
		let linkText: string;
		if (this.settings.linkFormat === 'wikilink') {
			linkText = `[[${linkUrl}|${item.name}]]`;
		} else {
			linkText = `[${item.name}](${linkUrl})`;
		}

		if (this.settings.insertThumbnail) {
			const card = this.buildLinkCard(item);
			editor.replaceSelection(card);
		} else {
			editor.replaceSelection(linkText);
		}

		new Notice(`Inserted link to: ${item.name}`);
	}

	private pathToFileUrl(path: string): string {
		const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
		return `file://${encodedPath}`;
	}

	private buildMetadataLine(item: EagleItem): string {
		const linkUrl = buildEagleItemUrl(item.id);
		const tags = item.tags
			.filter(t => !t.startsWith('r2:') && t !== 'r2-cloud' && t !== 'cloud-upload')
			.map(t => `#${this.normalizeTag(t)}`)
			.join(' ');
		const dimensions = item.width && item.height ? `${item.width}×${item.height}` : '';

		return `> **${item.ext.toUpperCase()}** | ${this.formatFileSize(item.size)}${dimensions ? ` | ${dimensions}` : ''} | ${tags || 'No tags'} | [Eagle](${linkUrl})`;
	}

	private buildLinkCard(item: EagleItem): string {
		const linkUrl = buildEagleItemUrl(item.id);
		const tags = item.tags.map(t => `#${this.normalizeTag(t)}`).join(' ');
		const dimensions = item.width && item.height ? `${item.width}×${item.height}` : 'N/A';
		
		return `> [!cmdspace-eagle] ${item.name}
> 
> | Property | Value |
> |----------|-------|
> | **Type** | ${item.ext.toUpperCase()} |
> | **Size** | ${this.formatFileSize(item.size)} |
> | **Dimensions** | ${dimensions} |
> | **Tags** | ${tags || 'None'} |
> ${item.annotation ? `> **Annotation**: ${item.annotation}\n` : ''}
> [Open in Eagle](${linkUrl})

`;
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
}

export class EagleFolderModal extends FuzzySuggestModal<{ id: string; name: string; path: string }> {
	private folders: { id: string; name: string; path: string }[] = [];
	private onSelect: (folderId: string) => void;

	constructor(
		app: App,
		folders: { id: string; name: string; path: string }[],
		onSelect: (folderId: string) => void
	) {
		super(app);
		this.folders = folders;
		this.onSelect = onSelect;
		this.setPlaceholder('Select Eagle folder...');
	}

	getItems(): { id: string; name: string; path: string }[] {
		return this.folders;
	}

	getItemText(item: { id: string; name: string; path: string }): string {
		return item.path;
	}

	onChooseItem(item: { id: string; name: string; path: string }): void {
		this.onSelect(item.id);
	}
}

export interface ImagePasteChoiceResponse {
	choice: 'eagle' | 'local' | 'cloud' | 'cancel';
	rememberChoice: boolean;
}

export class ImagePasteChoiceModal extends Modal {
	private response: Partial<ImagePasteChoiceResponse> = { rememberChoice: false };
	private resolvePromise?: (value: ImagePasteChoiceResponse) => void;
	private cloudProviderName: string;

	constructor(app: App, cloudProviderName: string = 'Cloud') {
		super(app);
		this.cloudProviderName = cloudProviderName;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cmdspace-paste-choice-modal');

		contentEl.createEl('h2', { text: 'Where to save image?' });

		const buttonContainer = contentEl.createDiv({ cls: 'cmdspace-paste-buttons' });

		const eagleBtn = buttonContainer.createEl('button', { 
			text: 'Eagle (Local)',
			cls: 'mod-cta'
		});
		eagleBtn.addEventListener('click', () => {
			this.response.choice = 'eagle';
			this.close();
		});

		const localBtn = buttonContainer.createEl('button', { text: 'Vault (Local)' });
		localBtn.addEventListener('click', () => {
			this.response.choice = 'local';
			this.close();
		});

		const cloudBtn = buttonContainer.createEl('button', { 
			text: `${this.cloudProviderName} (Cloud)`,
			cls: 'mod-warning'
		});
		cloudBtn.addEventListener('click', () => {
			this.response.choice = 'cloud';
			this.close();
		});

		new Setting(contentEl)
			.setName('Remember this choice')
			.setDesc('You can change this later in plugin settings')
			.addToggle((toggle) => {
				toggle.setValue(false).onChange((value) => {
					this.response.rememberChoice = value;
				});
			});
	}

	onClose(): void {
		if (this.resolvePromise) {
			this.resolvePromise({
				choice: this.response.choice ?? 'cancel',
				rememberChoice: this.response.rememberChoice ?? false,
			});
		}
	}

	getResponse(): Promise<ImagePasteChoiceResponse> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
		});
	}
}
