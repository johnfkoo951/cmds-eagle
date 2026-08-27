import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { userInfo } from 'os';
import CMDSPACELinkEagle from './main';
import { EagleApiService } from './api';
import {
	CloudProviderType,
	ImagePasteBehavior,
	LinkMode,
	SearchScope,
	SUPPORTED_IMAGE_EXTENSIONS,
	SUPPORTED_VIDEO_EXTENSIONS,
	SUPPORTED_DOCUMENT_EXTENSIONS,
	ComputerProfile,
	CrossPlatformConversionMode,
	PlatformType,
} from './types';
import { findCurrentComputer, isAbsolutePath, profileLibraryRoot } from './platform-paths';

// Shown under the mode dropdown so the trade-off is visible at the point of choice.
const LINK_MODE_DESCRIPTIONS: Record<LinkMode, string> = {
	'photo-info': 'Thumbnail linked to Eagle, plus one line of metadata. Renders on every device.',
	'photo-only': 'Thumbnail linked to Eagle, nothing else. Renders on every device.',
	'link-only': 'Shows only the item name as an eagle:// hyperlink. Opens that item in Eagle without copying a file into the vault.',
	'cmds-eagle': 'Embeds the original by absolute file:// path, plus one line of metadata. Renders on registered desktops that mount the library — never on mobile.',
	'cmds-eagle-photo-only': 'Embeds only the original image by absolute file:// path, with no metadata line. Renders on registered desktops that mount the library — never on mobile.',
	'cmds-eagle-photo-link': 'Embeds the original image as an eagle:// hyperlink. Clicking the image opens that item in Eagle.',
};

export class CMDSPACEEagleSettingTab extends PluginSettingTab {
	plugin: CMDSPACELinkEagle;

	constructor(app: App, plugin: CMDSPACELinkEagle) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName('Connection').setHeading();

		new Setting(containerEl)
			.setName('Eagle API Base URL')
			.setDesc('The base URL for Eagle\'s local API (default: http://localhost:41595)')
			.addText(text => text
				.setPlaceholder('http://localhost:41595')
				.setValue(this.plugin.settings.eagleApiBaseUrl)
				.onChange(async (value) => {
					this.plugin.settings.eagleApiBaseUrl = value || 'http://localhost:41595';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Connection Timeout')
			.setDesc('Timeout in milliseconds for API requests')
			.addText(text => text
				.setPlaceholder('5000')
				.setValue(this.plugin.settings.connectionTimeout.toString())
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.connectionTimeout = num;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Test Connection')
			.setDesc('Check if Eagle is running and accessible')
			.addButton(button => button
				.setButtonText('Test')
				.onClick(async () => {
					const api = new EagleApiService(this.plugin.settings);
					const info = await api.getApplicationInfo();
					if (info) {
						new Notice(`✓ Connected to Eagle ${info.version} (${info.platform})`);
					} else {
						new Notice('✗ Failed to connect to Eagle. Make sure Eagle is running.');
					}
				}));

		new Setting(containerEl).setName('Image paste/drop behavior').setHeading();

		new Setting(containerEl)
			.setName('Where to store images')
			.setDesc('What to do with an image when you paste or drop it')
			.addDropdown(dropdown => dropdown
				.addOption('eagle', 'Import into Eagle (recommended)')
				.addOption('local', 'Save to vault as an attachment')
				.addOption('cloud', 'Upload to cloud provider')
				.addOption('ask', 'Ask every time')
				.setValue(this.plugin.settings.imagePasteBehavior)
				.onChange(async (value: ImagePasteBehavior) => {
					this.plugin.settings.imagePasteBehavior = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('What goes into the note')
			.setDesc(LINK_MODE_DESCRIPTIONS[this.plugin.settings.linkMode])
			.addDropdown(dropdown => dropdown
				.addOption('photo-info', 'Photo + info — portable thumbnail')
				.addOption('photo-only', 'Photo only — portable thumbnail')
				.addOption('cmds-eagle', 'Original photo + info — registered desktops')
				.addOption('cmds-eagle-photo-only', 'Original photo only — registered desktops')
				.addOption('cmds-eagle-photo-link', 'Original photo linked to eagle — registered desktops')
				.addOption('link-only', 'Eagle link only — hyperlink text')
				.setValue(this.plugin.settings.linkMode)
				.onChange(async (value: LinkMode) => {
					this.plugin.settings.linkMode = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		new Setting(containerEl)
			.setName('Thumbnail folder')
			.setDesc('Vault folder that receives the copied thumbnails, named by Eagle item id. Originals stay in Eagle. Used by the photo modes.')
			.addText(text => text
				.setPlaceholder('attachments/eagle')
				.setValue(this.plugin.settings.vaultThumbnailDir)
				.onChange(async (value) => {
					this.plugin.settings.vaultThumbnailDir = value.trim() || 'attachments/eagle';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Hidden tag prefixes in card')
			.setDesc('Comma-separated tag prefixes to leave out of the metadata card — they exist for tooling, not for readers.')
			.addText(text => text
				.setPlaceholder('cli-eagle:, r2:')
				.setValue(this.plugin.settings.cardHiddenTagPrefixes.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.cardHiddenTagPrefixes = value
						.split(',')
						.map(prefix => prefix.trim())
						.filter(Boolean);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Thumbnail wait timeout (ms)')
			.setDesc('How long to wait for Eagle to generate a thumbnail before falling back to a plain deep link. Large files need more time.')
			.addText(text => text
				.setPlaceholder('10000')
				.setValue(String(this.plugin.settings.thumbnailPollTimeoutMs))
				.onChange(async (value) => {
					const parsed = parseInt(value, 10);
					this.plugin.settings.thumbnailPollTimeoutMs = Number.isFinite(parsed) && parsed > 0
						? parsed
						: 10000;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Thumbnail size warning (KB)')
			.setDesc('Warn when a copied thumbnail exceeds this size. Eagle skips thumbnails for small images, so the original is copied instead. Warns only — never blocks.')
			.addText(text => text
				.setPlaceholder('2048')
				.setValue(String(this.plugin.settings.thumbnailMaxKB))
				.onChange(async (value) => {
					const parsed = parseInt(value, 10);
					this.plugin.settings.thumbnailMaxKB = Number.isFinite(parsed) && parsed > 0 ? parsed : 2048;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Remove staged copy after import')
			.setDesc('Delete the file staged under .eagle-temp/ only after Eagle\'s copied original exists at its complete size. Turn off only when debugging.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.deleteTempAfterImport)
				.onChange(async (value) => {
					this.plugin.settings.deleteTempAfterImport = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl).setName('Excalidraw integration').setHeading();

		new Setting(containerEl)
			.setName('Embed images in Excalidraw via cloud')
			.setDesc('When you paste or drop an image onto an Excalidraw canvas, upload it to your cloud provider and embed the URL instead of saving a vault attachment. Eagle assets are resolved to the original; screenshots are uploaded as-is. Requires the Excalidraw plugin and a configured cloud provider.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.excalidrawIntegration)
				.onChange(async (value) => {
					this.plugin.settings.excalidrawIntegration = value;
					await this.plugin.saveSettings();
					// Attach to any open canvases now; disabling takes effect immediately
					// because the paste/drop handlers no-op when the setting is off.
					if (value) this.plugin.scanAndAttachExcalidrawContainers();
				}));

		new Setting(containerEl)
			.setName('Also add pasted screenshots to Eagle')
			.setDesc('When pasting a clipboard image (not already in Eagle) onto a canvas, also import it into your Eagle library (into the default folder, if set).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.excalidrawImportToEagle)
				.onChange(async (value) => {
					this.plugin.settings.excalidrawImportToEagle = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl).setName('Search & embed').setHeading();

		new Setting(containerEl)
			.setName('Include metadata card')
			.setDesc('Add metadata (type, size, tags, Eagle link) below the image when embedding')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.insertThumbnail)
				.onChange(async (value) => {
					this.plugin.settings.insertThumbnail = value;
					await this.plugin.saveSettings();
				}));

		this.renderSearchFiltersSettings(containerEl);

		new Setting(containerEl).setName('Cloud storage provider').setHeading();

		new Setting(containerEl)
			.setName('Active Cloud Provider')
			.setDesc('Select which cloud storage to use for image uploads')
			.addDropdown(dropdown => dropdown
				.addOption('r2', 'Cloudflare R2')
				.addOption('imghippo', 'ImgHippo (Free)')
				.addOption('s3', 'Amazon S3')
				.addOption('webdav', 'WebDAV (Synology/NAS)')
				.addOption('custom', 'Custom Server')
				.setValue(this.plugin.settings.activeCloudProvider)
				.onChange(async (value: CloudProviderType) => {
					this.plugin.settings.activeCloudProvider = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		this.renderCloudProviderSettings(containerEl);

		new Setting(containerEl).setName('Cross-platform sync').setHeading();
		this.renderCrossPlatformSettings(containerEl);

		containerEl.createEl('hr', { attr: { style: 'margin: 24px 0; border: none; border-top: 1px solid var(--background-modifier-border);' } });
		
		const footerEl = containerEl.createEl('div', { attr: { style: 'text-align: center; color: var(--text-muted); font-size: 12px;' } });
		footerEl.createEl('div', { text: `CMDS Eagle v${this.plugin.manifest.version}`, attr: { style: 'margin-bottom: 8px;' } });
		
		const linksEl = footerEl.createEl('div');
		linksEl.createSpan({ text: 'CMDSPACE ' });
		const eduLink = linksEl.createEl('a', { text: 'Education', href: 'https://class.cmdspace.kr/' });
		eduLink.setAttr('target', '_blank');
		linksEl.createSpan({ text: ' · ' });
		const ytLink = linksEl.createEl('a', { text: 'YouTube', href: 'https://www.youtube.com/@cmdspace' });
		ytLink.setAttr('target', '_blank');
		linksEl.createSpan({ text: ' · ' });
		const ghLink = linksEl.createEl('a', { text: 'GitHub', href: 'https://github.com/johnfkoo951/cmds-eagle' });
		ghLink.setAttr('target', '_blank');
	}

	private renderCloudProviderSettings(containerEl: HTMLElement): void {
		const provider = this.plugin.settings.activeCloudProvider;
		const providerContainer = containerEl.createDiv({ cls: 'cloud-provider-settings' });

		switch (provider) {
			case 'imghippo':
				this.renderImgHippoSettings(providerContainer);
				break;
			case 'r2':
				this.renderR2Settings(providerContainer);
				break;
			case 's3':
				this.renderS3Settings(providerContainer);
				break;
			case 'webdav':
				this.renderWebDAVSettings(providerContainer);
				break;
			case 'custom':
				this.renderCustomSettings(providerContainer);
				break;
		}
	}

	private renderR2Settings(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Cloudflare R2').setHeading();

		const infoEl = containerEl.createEl('div', { cls: 'setting-item-description cmds-eagle-info-block' });
		infoEl.createEl('p', { text: 'Cloudflare R2 requires a Worker for uploads. Setup:' });
		const r2List = infoEl.createEl('ol');
		r2List.createEl('li', { text: 'Create an R2 bucket in Cloudflare dashboard' });
		r2List.createEl('li', { text: 'Deploy the Eagle Cloud Worker (see plugin docs)' });
		r2List.createEl('li', { text: 'Copy Worker URL and API Key below' });

		new Setting(containerEl)
			.setName('Worker URL')
			.setDesc('Cloudflare Worker URL (must end with .workers.dev)')
			.addText(text => text
				.setPlaceholder('https://eagle-uploader.xxx.workers.dev')
				.setValue(this.plugin.settings.cloudProviders.r2.workerUrl)
				.onChange(async (value) => {
					let url = value.trim();
					if (url && !url.startsWith('http')) {
						url = 'https://' + url;
					}
					url = url.replace(/\/$/, '');
					this.plugin.settings.cloudProviders.r2.workerUrl = url;
					this.plugin.settings.cloudProviders.r2.enabled = !!(url && this.plugin.settings.cloudProviders.r2.apiKey);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('API_KEY from Cloudflare Worker Variables')
			.addText(text => text
				.setPlaceholder('your-api-key-here')
				.setValue(this.plugin.settings.cloudProviders.r2.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.cloudProviders.r2.apiKey = value.trim();
					this.plugin.settings.cloudProviders.r2.enabled = !!(this.plugin.settings.cloudProviders.r2.workerUrl && value.trim());
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Public URL')
			.setDesc('R2 bucket public URL (starts with pub-)')
			.addText(text => text
				.setPlaceholder('https://pub-xxx.r2.dev')
				.setValue(this.plugin.settings.cloudProviders.r2.publicUrl)
				.onChange(async (value) => {
					this.plugin.settings.cloudProviders.r2.publicUrl = value.trim().replace(/\/$/, '');
					await this.plugin.saveSettings();
				}));
	}

	private renderImgHippoSettings(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('ImgHippo (free image hosting)').setHeading();

		const infoEl = containerEl.createEl('div', { cls: 'setting-item-description cmds-eagle-info-block' });
		infoEl.createEl('p', { text: 'ImgHippo is a free image hosting service. To get your API key:' });
		const ihList = infoEl.createEl('ol');
		const ihLi1 = ihList.createEl('li');
		ihLi1.appendText('Visit ');
		ihLi1.createEl('a', { text: 'imghippo.com', href: 'https://www.imghippo.com/' });
		ihLi1.appendText(' and sign up/login');
		const ihLi2 = ihList.createEl('li');
		ihLi2.appendText('Go to ');
		ihLi2.createEl('a', { text: 'Settings page', href: 'https://www.imghippo.com/settings' });
		ihList.createEl('li', { text: 'Copy your API key and paste it below' });

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Your ImgHippo API key from the settings page')
			.addText(text => text
				.setPlaceholder('Your ImgHippo API key')
				.setValue(this.plugin.settings.cloudProviders.imghippo.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.cloudProviders.imghippo.apiKey = value.trim();
					this.plugin.settings.cloudProviders.imghippo.enabled = !!value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Test Connection')
			.setDesc('Verify API key is valid')
			.addButton(button => button
				.setButtonText('Test')
				.onClick(async () => {
					const config = this.plugin.settings.cloudProviders.imghippo;
					if (!config.apiKey) {
						new Notice('✗ Please enter an API key first');
						return;
					}
					new Notice('✓ ImgHippo API key configured');
				}));
	}

	private renderS3Settings(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Amazon S3').setHeading();
		
		new Setting(containerEl)
			.setName('Endpoint')
			.setDesc('S3-compatible endpoint URL')
			.addText(text => text
				.setPlaceholder('https://s3.amazonaws.com')
				.setValue(this.plugin.settings.cloudProviders.s3.endpoint)
				.onChange(async (value) => {
					this.plugin.settings.cloudProviders.s3.endpoint = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Region')
			.addText(text => text
				.setPlaceholder('us-east-1')
				.setValue(this.plugin.settings.cloudProviders.s3.region)
				.onChange(async (value) => {
					this.plugin.settings.cloudProviders.s3.region = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Bucket')
			.addText(text => text
				.setPlaceholder('my-bucket')
				.setValue(this.plugin.settings.cloudProviders.s3.bucket)
				.onChange(async (value) => {
					this.plugin.settings.cloudProviders.s3.bucket = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Access Key ID')
			.addText(text => text
				.setValue(this.plugin.settings.cloudProviders.s3.accessKeyId)
				.onChange(async (value) => {
					this.plugin.settings.cloudProviders.s3.accessKeyId = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Secret Access Key')
			.addText(text => text
				.setValue(this.plugin.settings.cloudProviders.s3.secretAccessKey)
				.onChange(async (value) => {
					this.plugin.settings.cloudProviders.s3.secretAccessKey = value.trim();
					this.plugin.settings.cloudProviders.s3.enabled = !!(
						this.plugin.settings.cloudProviders.s3.endpoint &&
						this.plugin.settings.cloudProviders.s3.accessKeyId &&
						value.trim()
					);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Public URL (optional)')
			.setDesc('Custom public URL for accessing uploaded files')
			.addText(text => text
				.setPlaceholder('https://cdn.example.com')
				.setValue(this.plugin.settings.cloudProviders.s3.publicUrl)
				.onChange(async (value) => {
					this.plugin.settings.cloudProviders.s3.publicUrl = value.trim();
					await this.plugin.saveSettings();
				}));
	}

	private renderWebDAVSettings(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('WebDAV').setHeading();
		containerEl.createEl('p', { 
			text: 'Works with Synology NAS, Nextcloud, ownCloud, or any WebDAV server.',
			cls: 'setting-item-description'
		});
		
		new Setting(containerEl)
			.setName('Server URL')
			.addText(text => text
				.setPlaceholder('https://nas.example.com/webdav')
				.setValue(this.plugin.settings.cloudProviders.webdav.serverUrl)
				.onChange(async (value) => {
					this.plugin.settings.cloudProviders.webdav.serverUrl = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Username')
			.addText(text => text
				.setValue(this.plugin.settings.cloudProviders.webdav.username)
				.onChange(async (value) => {
					this.plugin.settings.cloudProviders.webdav.username = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Password')
			.addText(text => text
				.setValue(this.plugin.settings.cloudProviders.webdav.password)
				.onChange(async (value) => {
					this.plugin.settings.cloudProviders.webdav.password = value;
					this.plugin.settings.cloudProviders.webdav.enabled = !!(
						this.plugin.settings.cloudProviders.webdav.serverUrl &&
						this.plugin.settings.cloudProviders.webdav.username &&
						value
					);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Upload Path')
			.setDesc('Directory path for uploads')
			.addText(text => text
				.setPlaceholder('/eagle-uploads')
				.setValue(this.plugin.settings.cloudProviders.webdav.uploadPath)
				.onChange(async (value) => {
					this.plugin.settings.cloudProviders.webdav.uploadPath = value.trim() || '/eagle-uploads';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Public URL')
			.setDesc('Public URL prefix for accessing uploaded files')
			.addText(text => text
				.setPlaceholder('https://public.example.com')
				.setValue(this.plugin.settings.cloudProviders.webdav.publicUrl)
				.onChange(async (value) => {
					this.plugin.settings.cloudProviders.webdav.publicUrl = value.trim();
					await this.plugin.saveSettings();
				}));
	}

	private renderCustomSettings(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Custom server').setHeading();
		containerEl.createEl('p', { 
			text: 'Configure a custom upload endpoint. Server should accept multipart/form-data with "file" field.',
			cls: 'setting-item-description'
		});
		
		new Setting(containerEl)
			.setName('Upload URL')
			.addText(text => text
				.setPlaceholder('https://your-server.com/upload')
				.setValue(this.plugin.settings.cloudProviders.custom.uploadUrl)
				.onChange(async (value) => {
					this.plugin.settings.cloudProviders.custom.uploadUrl = value.trim();
					this.plugin.settings.cloudProviders.custom.enabled = !!value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Public URL')
			.setDesc('Base URL for accessing uploaded files')
			.addText(text => text
				.setPlaceholder('https://cdn.your-server.com')
				.setValue(this.plugin.settings.cloudProviders.custom.publicUrl)
				.onChange(async (value) => {
					this.plugin.settings.cloudProviders.custom.publicUrl = value.trim();
					await this.plugin.saveSettings();
				}));
	}

	private renderSearchFiltersSettings(containerEl: HTMLElement): void {
		const filterContainer = containerEl.createDiv({ cls: 'cmdspace-eagle-settings-filters' });
		
		const scopeSection = filterContainer.createDiv({ cls: 'cmdspace-eagle-settings-filter-section' });
		scopeSection.createEl('div', { text: 'Default search scope', cls: 'cmdspace-eagle-settings-filter-title' });
		const scopeButtons = scopeSection.createDiv({ cls: 'cmdspace-eagle-settings-filter-buttons' });
		
		const scopes: { key: SearchScope; label: string }[] = [
			{ key: 'name', label: 'Name' },
			{ key: 'tags', label: 'Tags' },
			{ key: 'annotation', label: 'Notes' },
			{ key: 'folders', label: 'Folders' },
		];
		
		scopes.forEach(({ key, label }) => {
			const btn = scopeButtons.createEl('button', {
				text: label,
				cls: `cmdspace-eagle-settings-filter-btn ${this.plugin.settings.searchScope.includes(key) ? 'is-active' : ''}`
			});
			btn.addEventListener('click', () => { void (async () => {
				if (this.plugin.settings.searchScope.includes(key)) {
					if (this.plugin.settings.searchScope.length > 1) {
						this.plugin.settings.searchScope = this.plugin.settings.searchScope.filter(s => s !== key);
						btn.removeClass('is-active');
					}
				} else {
					this.plugin.settings.searchScope.push(key);
					btn.addClass('is-active');
				}
				await this.plugin.saveSettings();
			})(); });
		});

		const typeSection = filterContainer.createDiv({ cls: 'cmdspace-eagle-settings-filter-section' });
		typeSection.createEl('div', { text: 'Default file types', cls: 'cmdspace-eagle-settings-filter-title' });
		const typeButtons = typeSection.createDiv({ cls: 'cmdspace-eagle-settings-filter-buttons' });
		
		const hasAllImages = () => SUPPORTED_IMAGE_EXTENSIONS.every(ext => 
			this.plugin.settings.searchFileTypes.includes(ext)
		);
		const hasAllVideos = () => SUPPORTED_VIDEO_EXTENSIONS.every(ext => 
			this.plugin.settings.searchFileTypes.includes(ext)
		);
		const hasAllDocs = () => SUPPORTED_DOCUMENT_EXTENSIONS.every(ext => 
			this.plugin.settings.searchFileTypes.includes(ext)
		);

		const imgBtn = typeButtons.createEl('button', {
			text: 'Images',
			cls: `cmdspace-eagle-settings-filter-btn ${hasAllImages() ? 'is-active' : ''}`
		});
		imgBtn.addEventListener('click', () => { void (async () => {
			if (hasAllImages()) {
				this.plugin.settings.searchFileTypes = this.plugin.settings.searchFileTypes.filter(
					ext => !SUPPORTED_IMAGE_EXTENSIONS.includes(ext as typeof SUPPORTED_IMAGE_EXTENSIONS[number])
				);
				imgBtn.removeClass('is-active');
			} else {
				SUPPORTED_IMAGE_EXTENSIONS.forEach(ext => {
					if (!this.plugin.settings.searchFileTypes.includes(ext)) {
						this.plugin.settings.searchFileTypes.push(ext);
					}
				});
				imgBtn.addClass('is-active');
			}
			if (this.plugin.settings.searchFileTypes.length === 0) {
				this.plugin.settings.searchFileTypes = [...SUPPORTED_IMAGE_EXTENSIONS];
				imgBtn.addClass('is-active');
			}
			await this.plugin.saveSettings();
		})(); });

		const vidBtn = typeButtons.createEl('button', {
			text: 'Videos',
			cls: `cmdspace-eagle-settings-filter-btn ${hasAllVideos() ? 'is-active' : ''}`
		});
		vidBtn.addEventListener('click', () => { void (async () => {
			if (hasAllVideos()) {
				this.plugin.settings.searchFileTypes = this.plugin.settings.searchFileTypes.filter(
					ext => !SUPPORTED_VIDEO_EXTENSIONS.includes(ext as typeof SUPPORTED_VIDEO_EXTENSIONS[number])
				);
				vidBtn.removeClass('is-active');
			} else {
				SUPPORTED_VIDEO_EXTENSIONS.forEach(ext => {
					if (!this.plugin.settings.searchFileTypes.includes(ext)) {
						this.plugin.settings.searchFileTypes.push(ext);
					}
				});
				vidBtn.addClass('is-active');
			}
			if (this.plugin.settings.searchFileTypes.length === 0) {
				this.plugin.settings.searchFileTypes = [...SUPPORTED_IMAGE_EXTENSIONS];
				imgBtn.addClass('is-active');
			}
			await this.plugin.saveSettings();
		})(); });

		const docBtn = typeButtons.createEl('button', {
			text: 'Documents',
			cls: `cmdspace-eagle-settings-filter-btn ${hasAllDocs() ? 'is-active' : ''}`
		});
		docBtn.addEventListener('click', () => { void (async () => {
			if (hasAllDocs()) {
				this.plugin.settings.searchFileTypes = this.plugin.settings.searchFileTypes.filter(
					ext => !SUPPORTED_DOCUMENT_EXTENSIONS.includes(ext as typeof SUPPORTED_DOCUMENT_EXTENSIONS[number])
				);
				docBtn.removeClass('is-active');
			} else {
				SUPPORTED_DOCUMENT_EXTENSIONS.forEach(ext => {
					if (!this.plugin.settings.searchFileTypes.includes(ext)) {
						this.plugin.settings.searchFileTypes.push(ext);
					}
				});
				docBtn.addClass('is-active');
			}
			if (this.plugin.settings.searchFileTypes.length === 0) {
				this.plugin.settings.searchFileTypes = [...SUPPORTED_IMAGE_EXTENSIONS];
				imgBtn.addClass('is-active');
			}
			await this.plugin.saveSettings();
		})(); });
	}

	private renderCrossPlatformSettings(containerEl: HTMLElement): void {
		const infoEl = containerEl.createEl('div', { cls: 'setting-item-description cmds-eagle-info-block' });
		infoEl.createEl('p', { text: 'Enable this to use the same vault on multiple computers (macOS/Windows).' });
		infoEl.createEl('p', { text: 'File paths will be automatically converted based on the current computer.', cls: 'cmds-eagle-muted' });

		new Setting(containerEl)
			.setName('Enable cross-platform path conversion')
			.setDesc('Convert file:// paths between registered computers')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableCrossPlatform)
				.onChange(async (value) => {
					this.plugin.settings.enableCrossPlatform = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		if (!this.plugin.settings.enableCrossPlatform) {
			return;
		}

		new Setting(containerEl)
			.setName('Auto-convert paths on file open')
			.setDesc('Automatically convert cross-platform paths when opening a note')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoConvertCrossPlatformPaths)
				.onChange(async (value) => {
					this.plugin.settings.autoConvertCrossPlatformPaths = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Conversion mode')
			.setDesc('Render-only remaps images as they are displayed and never edits the note — safe when several machines share the vault. Modify source rewrites the note itself.')
			.addDropdown(dropdown => dropdown
				.addOption('render-only', 'Render only (recommended)')
				.addOption('modify-source', 'Modify note source')
				.setValue(this.plugin.settings.crossPlatformConversionMode)
				.onChange(async (value) => {
					this.plugin.settings.crossPlatformConversionMode = value as CrossPlatformConversionMode;
					await this.plugin.saveSettings();
				}));

		const currentPlatform = process.platform as PlatformType;
		const currentUsername = this.detectCurrentUsername();

		new Setting(containerEl)
			.setName('Add current computer')
			.setDesc(`Detected: ${currentPlatform === 'darwin' ? 'macOS' : 'Windows'} / ${currentUsername}`)
			.addButton(button => button
				.setButtonText('Add')
				.onClick(async () => {
					const existingIndex = this.plugin.settings.computers.findIndex(
						c => c.platform === currentPlatform && c.username === currentUsername
					);
					
					if (existingIndex >= 0) {
						new Notice('This computer is already registered');
						return;
					}

					const newProfile: ComputerProfile = {
						id: `${currentPlatform}-${currentUsername}-${Date.now()}`,
						name: currentPlatform === 'darwin' ? `Mac (${currentUsername})` : `Windows (${currentUsername})`,
						platform: currentPlatform,
						username: currentUsername,
						subPath: '',
						eagleLibraryPath: '',
						isCurrentComputer: true,
					};

					// The marker only disambiguates duplicate profiles for this OS account.
					for (const profile of this.plugin.settings.computers) {
						if (profile.platform === currentPlatform && profile.username === currentUsername) {
							profile.isCurrentComputer = false;
						}
					}
					this.plugin.settings.computers.push(newProfile);
					await this.plugin.saveSettings();
					this.display();
					new Notice('Current computer added');
				}));

		if (this.plugin.settings.computers.length > 0) {
			const listContainer = containerEl.createDiv({ cls: 'cmdspace-eagle-computer-list' });

			listContainer.createEl('div', {
				text: 'Registered Computers',
				cls: 'cmdspace-eagle-computer-list-title'
			});

			const currentComputer = findCurrentComputer(
				this.plugin.settings.computers,
				currentPlatform,
				currentUsername
			);

			for (const computer of this.plugin.settings.computers) {
				const isCurrentComputer = computer.id === currentComputer?.id;

				const computerEl = listContainer.createDiv({ cls: 'cmdspace-eagle-computer-item' });
				if (isCurrentComputer) {
					computerEl.addClass('is-current');
				}

				const headerRow = computerEl.createDiv({ attr: { style: 'display: flex; justify-content: space-between; align-items: center; width: 100%;' } });

				const infoDiv = headerRow.createDiv({ attr: { style: 'flex: 1;' } });
				const platformIcon = computer.platform === 'darwin' ? '🍎' : '🪟';
				infoDiv.createEl('div', { 
					text: `${platformIcon} ${computer.name}`,
					attr: { style: 'font-weight: 500;' }
				});
				infoDiv.createEl('div', { 
					text: `${computer.platform === 'darwin' ? 'macOS' : 'Windows'} • ${computer.username}${isCurrentComputer ? ' (current)' : ''}`,
					attr: { style: 'font-size: 12px; color: var(--text-muted);' }
				});

				const deleteBtn = headerRow.createEl('button', { text: '×', cls: 'cmdspace-eagle-computer-delete' });

				const rootContainer = computerEl.createDiv({ attr: { style: 'margin-top: 8px; width: 100%;' } });
				rootContainer.createEl('label', {
					text: 'Eagle library root on this computer (absolute path)',
					attr: { style: 'font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;' }
				});
				const rootInput = rootContainer.createEl('input', {
					type: 'text',
					value: profileLibraryRoot(computer) || '',
					placeholder: computer.platform === 'darwin'
						? 'e.g., /Volumes/Assets/My Library.library'
						: 'e.g., Z:\\My Library.library or \\\\NAS\\Assets\\My Library.library',
					attr: { style: 'width: 100%; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--background-modifier-border);' }
				});
				rootInput.addEventListener('change', () => { void (async () => {
					const value = rootInput.value.trim();
					if (value && !isAbsolutePath(value)) {
						new Notice('Enter an absolute path: /Volumes/…, Z:\\… or \\\\NAS\\share\\…');
						rootInput.value = profileLibraryRoot(computer) || '';
						return;
					}
					const idx = this.plugin.settings.computers.findIndex(c => c.id === computer.id);
					if (idx >= 0) {
						this.plugin.settings.computers[idx].eagleLibraryPath = value;
						await this.plugin.saveSettings();
					}
				})(); });

				const matchesRuntimeIdentity = computer.platform === currentPlatform
					&& computer.username === currentUsername;
				if (matchesRuntimeIdentity && !isCurrentComputer) {
					const claimBtn = computerEl.createEl('button', {
						text: 'Set as this computer',
						attr: { style: 'margin-top: 8px; font-size: 11px;' }
					});
					claimBtn.addEventListener('click', () => { void (async () => {
						for (const profile of this.plugin.settings.computers) {
							if (profile.platform === currentPlatform && profile.username === currentUsername) {
								profile.isCurrentComputer = profile.id === computer.id;
							}
						}
						await this.plugin.saveSettings();
						this.display();
						new Notice(`Now treating "${computer.name}" as this computer`);
					})(); });
				}

				deleteBtn.addEventListener('click', () => { void (async () => {
					this.plugin.settings.computers = this.plugin.settings.computers.filter(c => c.id !== computer.id);
					await this.plugin.saveSettings();
					this.display();
					new Notice('Computer removed');
				})(); });
			}
		}
	}

	private detectCurrentUsername(): string {
		try {
			return userInfo().username;
		} catch {
			// Fall back to the vault path for older desktop runtimes.
		}

		const adapter = this.app.vault.adapter as { basePath?: string };
		const vaultPath = adapter.basePath || '';
		const platform = String(process.platform);

		if (platform === 'darwin') {
			const match = vaultPath.match(/^\/Users\/([^/]+)/);
			if (match) return match[1];
		} else if (platform === 'win32') {
			const match = vaultPath.match(/^[A-Za-z]:[/\\]Users[/\\]([^/\\]+)/i);
			if (match) return match[1];
		}

		return 'unknown';
	}
}
