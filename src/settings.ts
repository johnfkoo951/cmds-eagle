import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import CMDSPACELinkEagle from './main';
import { EagleApiService } from './api';
import { 
	CloudProviderType, 
	ImagePasteBehavior,
	SearchScope,
	SUPPORTED_IMAGE_EXTENSIONS,
	SUPPORTED_VIDEO_EXTENSIONS,
	SUPPORTED_DOCUMENT_EXTENSIONS,
	ComputerProfile,
	PlatformType,
} from './types';

export class CMDSPACEEagleSettingTab extends PluginSettingTab {
	plugin: CMDSPACELinkEagle;

	constructor(app: App, plugin: CMDSPACELinkEagle) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'CMDS Eagle Settings' });

		containerEl.createEl('h3', { text: 'Connection' });

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

		containerEl.createEl('h3', { text: 'Image Paste/Drop Behavior' });

		new Setting(containerEl)
			.setName('Default image behavior')
			.setDesc('What to do when pasting or dropping images')
			.addDropdown(dropdown => dropdown
				.addOption('ask', 'Ask every time')
				.addOption('eagle', 'Always upload to Eagle (local)')
				.addOption('local', 'Always save to vault (local)')
				.addOption('cloud', 'Always upload to cloud')
				.setValue(this.plugin.settings.imagePasteBehavior)
				.onChange(async (value: ImagePasteBehavior) => {
					this.plugin.settings.imagePasteBehavior = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h3', { text: 'Search & Embed' });

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

		containerEl.createEl('h3', { text: 'Cloud Storage Provider' });

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

		containerEl.createEl('h3', { text: 'Cross-Platform Sync' });
		this.renderCrossPlatformSettings(containerEl);

		containerEl.createEl('hr', { attr: { style: 'margin: 24px 0; border: none; border-top: 1px solid var(--background-modifier-border);' } });
		
		const footerEl = containerEl.createEl('div', { attr: { style: 'text-align: center; color: var(--text-muted); font-size: 12px;' } });
		footerEl.createEl('div', { text: `CMDS Eagle v${this.plugin.manifest.version}`, attr: { style: 'margin-bottom: 8px;' } });
		
		const linksEl = footerEl.createEl('div');
		const eduLink = linksEl.createEl('a', { text: 'CMDSPACE Education', href: 'https://class.cmdspace.kr/' });
		eduLink.setAttr('target', '_blank');
		linksEl.createSpan({ text: ' · ' });
		const ytLink = linksEl.createEl('a', { text: 'YouTube', href: 'https://www.youtube.com/@cmdspace' });
		ytLink.setAttr('target', '_blank');
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
		containerEl.createEl('h4', { text: 'Cloudflare R2 Settings' });
		
		const infoEl = containerEl.createEl('div', { cls: 'setting-item-description' });
		infoEl.style.marginBottom = '12px';
		infoEl.innerHTML = `
			<p style="margin: 0 0 8px 0;">Cloudflare R2 requires a Worker for uploads. Setup:</p>
			<ol style="margin: 0; padding-left: 20px;">
				<li>Create an R2 bucket in Cloudflare dashboard</li>
				<li>Deploy the Eagle Cloud Worker (see plugin docs)</li>
				<li>Copy Worker URL and API Key below</li>
			</ol>
		`;
		
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
		containerEl.createEl('h4', { text: 'ImgHippo Settings (Free Image Hosting)' });
		
		const infoEl = containerEl.createEl('div', { cls: 'setting-item-description' });
		infoEl.style.marginBottom = '12px';
		infoEl.innerHTML = `
			<p style="margin: 0 0 8px 0;">ImgHippo is a free image hosting service. To get your API key:</p>
			<ol style="margin: 0; padding-left: 20px;">
				<li>Visit <a href="https://www.imghippo.com/">imghippo.com</a> and sign up/login</li>
				<li>Go to <a href="https://www.imghippo.com/settings">Settings page</a></li>
				<li>Copy your API key and paste it below</li>
			</ol>
		`;
		
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
		containerEl.createEl('h4', { text: 'Amazon S3 Settings' });
		
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
		containerEl.createEl('h4', { text: 'WebDAV Settings' });
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
		containerEl.createEl('h4', { text: 'Custom Server Settings' });
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
			btn.addEventListener('click', async () => {
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
			});
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
		imgBtn.addEventListener('click', async () => {
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
		});

		const vidBtn = typeButtons.createEl('button', {
			text: 'Videos',
			cls: `cmdspace-eagle-settings-filter-btn ${hasAllVideos() ? 'is-active' : ''}`
		});
		vidBtn.addEventListener('click', async () => {
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
		});

		const docBtn = typeButtons.createEl('button', {
			text: 'Documents',
			cls: `cmdspace-eagle-settings-filter-btn ${hasAllDocs() ? 'is-active' : ''}`
		});
		docBtn.addEventListener('click', async () => {
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
		});
	}

	private renderCrossPlatformSettings(containerEl: HTMLElement): void {
		const infoEl = containerEl.createEl('div', { cls: 'setting-item-description' });
		infoEl.style.marginBottom = '12px';
		infoEl.innerHTML = `
			<p style="margin: 0 0 8px 0;">Enable this to use the same vault on multiple computers (macOS/Windows).</p>
			<p style="margin: 0; color: var(--text-muted);">File paths will be automatically converted based on the current computer.</p>
		`;

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
						eagleLibraryPath: '',
						isCurrentComputer: true,
					};

					this.plugin.settings.computers.push(newProfile);
					await this.plugin.saveSettings();
					this.display();
					new Notice('Current computer added');
				}));

		if (this.plugin.settings.computers.length > 0) {
			const listContainer = containerEl.createDiv({ cls: 'cmdspace-eagle-computer-list' });
			listContainer.style.marginTop = '12px';
			listContainer.style.padding = '12px';
			listContainer.style.background = 'var(--background-secondary)';
			listContainer.style.borderRadius = '8px';

			listContainer.createEl('div', { 
				text: 'Registered Computers',
				attr: { style: 'font-weight: 600; margin-bottom: 12px;' }
			});

			for (const computer of this.plugin.settings.computers) {
				const isCurrentComputer = computer.platform === currentPlatform && computer.username === currentUsername;
				
				const computerEl = listContainer.createDiv({ cls: 'cmdspace-eagle-computer-item' });
				computerEl.style.display = 'flex';
				computerEl.style.justifyContent = 'space-between';
				computerEl.style.alignItems = 'center';
				computerEl.style.padding = '8px';
				computerEl.style.marginBottom = '8px';
				computerEl.style.background = 'var(--background-primary)';
				computerEl.style.borderRadius = '4px';
				computerEl.style.border = isCurrentComputer ? '2px solid var(--interactive-accent)' : '1px solid var(--background-modifier-border)';

				const infoDiv = computerEl.createDiv();
				const platformIcon = computer.platform === 'darwin' ? '🍎' : '🪟';
				infoDiv.createEl('div', { 
					text: `${platformIcon} ${computer.name}`,
					attr: { style: 'font-weight: 500;' }
				});
				infoDiv.createEl('div', { 
					text: `${computer.platform === 'darwin' ? 'macOS' : 'Windows'} • ${computer.username}${isCurrentComputer ? ' (current)' : ''}`,
					attr: { style: 'font-size: 12px; color: var(--text-muted);' }
				});

				const deleteBtn = computerEl.createEl('button', { text: '×' });
				deleteBtn.style.padding = '4px 8px';
				deleteBtn.style.cursor = 'pointer';
				deleteBtn.addEventListener('click', async () => {
					this.plugin.settings.computers = this.plugin.settings.computers.filter(c => c.id !== computer.id);
					await this.plugin.saveSettings();
					this.display();
					new Notice('Computer removed');
				});
			}
		}
	}

	private detectCurrentUsername(): string {
		const adapter = this.app.vault.adapter as { basePath?: string };
		const vaultPath = adapter.basePath || '';
		const platform = process.platform;

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
