export interface EagleApiResponse<T> {
	status: 'success' | 'error';
	data?: T;
	message?: string;
}

export interface EagleItem {
	id: string;
	name: string;
	size: number;
	ext: string;
	tags: string[];
	folders: string[];
	isDeleted: boolean;
	url: string;
	annotation: string;
	modificationTime: number;
	lastModified: number;
	width: number;
	height: number;
	noThumbnail?: boolean;
	palettes: EaglePalette[];
	star?: number;
}

export interface EaglePalette {
	color: [number, number, number];
	ratio: number;
}

export interface EagleFolder {
	id: string;
	name: string;
	description: string;
	children: EagleFolder[];
	modificationTime: number;
	tags: string[];
	imageCount: number;
	descendantImageCount: number;
	iconColor?: string;
}

export interface EagleLibraryInfo {
	folders: EagleFolder[];
	smartFolders: EagleSmartFolder[];
	quickAccess: { type: string; id: string }[];
	tagsGroups: EagleTagGroup[];
	modificationTime: number;
	applicationVersion: string;
}

export interface EagleSmartFolder {
	id: string;
	icon: string;
	name: string;
	description?: string;
	conditions: EagleCondition[];
	orderBy?: string;
}

export interface EagleCondition {
	match: 'AND' | 'OR';
	rules: EagleRule[];
}

export interface EagleRule {
	method: string;
	property: string;
	value: unknown;
}

export interface EagleTagGroup {
	id: string;
	name: string;
	tags: string[];
	color?: string;
}

export interface EagleApplicationInfo {
	version: string;
	prereleaseVersion: string | null;
	buildVersion: string;
	execPath: string;
	platform: string;
}

/** Where a pasted or dropped image is stored. */
export type ImagePasteBehavior = 'eagle' | 'local' | 'cloud' | 'ask';

/**
 * What goes into the note for an Eagle item. Orthogonal to
 * {@link ImagePasteBehavior}, which decides where the file is stored.
 *
 * | mode | note contains | works on other devices |
 * |---|---|---|
 * | `photo-info` | thumbnail + one-line card | yes |
 * | `photo-only` | thumbnail | yes |
 * | `link-only` | `eagle://` link, no file copied | yes |
 * | `cmds-eagle` | absolute `file://` embed of the original + card | registered desktops |
 * | `cmds-eagle-photo-only` | absolute `file://` embed of the original | registered desktops |
 * | `cmds-eagle-photo-link` | original image linked to its `eagle://` item | registered desktops |
 */
export type LinkMode =
	| 'photo-info'
	| 'photo-only'
	| 'link-only'
	| 'cmds-eagle'
	| 'cmds-eagle-photo-only'
	| 'cmds-eagle-photo-link';

/** Pre-release v2 values, folded into `imagePasteBehavior` + `linkMode` on load. */
export type LegacyCaptureMode = 'eagle-thumbnail' | 'eagle-original-link' | 'local' | 'cloud' | 'ask';

export type SearchScope = 'name' | 'tags' | 'annotation' | 'folders';

export const SUPPORTED_IMAGE_EXTENSIONS = [
	'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 
	'tiff', 'tif', 'heic', 'heif', 'avif', 'ico'
] as const;

export const SUPPORTED_VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'avi', 'mkv'] as const;

export const SUPPORTED_DOCUMENT_EXTENSIONS = ['pdf', 'psd', 'ai', 'sketch'] as const;

export type SupportedExtension = 
	| typeof SUPPORTED_IMAGE_EXTENSIONS[number] 
	| typeof SUPPORTED_VIDEO_EXTENSIONS[number]
	| typeof SUPPORTED_DOCUMENT_EXTENSIONS[number];

export type CloudProviderType = 'r2' | 's3' | 'webdav' | 'imghippo' | 'custom';

export type PlatformType = 'darwin' | 'win32';

export interface ComputerProfile {
	id: string;
	name: string;
	platform: PlatformType;
	username: string;
	/** Legacy: folders between the home directory and the library. Superseded by `eagleLibraryPath`. */
	subPath: string;
	/** Absolute path this computer mounts the Eagle library at — `/Volumes/…`, `Z:\…` or `\\NAS\share\…`. */
	eagleLibraryPath: string;
	/** Fallback marker for duplicate profiles with the same runtime platform and username. */
	isCurrentComputer?: boolean;
}

export type CrossPlatformConversionMode = 'modify-source' | 'render-only';

/**
 * A remembered Eagle library. Eagle opens exactly one library at a time, so
 * targeting another one means switching to it and switching back.
 */
/** Outcome of a Scan Eagle run, as reported to the settings tab. */
export interface LibraryScanResult {
	/** Profiles known after the scan. */
	total: number;
	/** Stored profiles whose library is gone but which were kept. */
	missing: string[];
	/** Profiles removed because auto-prune was on. */
	pruned: string[];
}

export interface EagleLibraryProfile {
	/** Absolute path to the `.library` bundle. This is the identity key. */
	path: string;
	/** Display name, as reported by `library.name`. */
	name: string;
	/** Folder new items land in. Folder ids are scoped to their library. */
	defaultFolderId: string;
	/**
	 * Human-readable folder path (`Inbox`, `Projects/Jazz Blend`). Kept alongside
	 * the id so a deleted or re-created folder can be re-resolved by name, and so
	 * the settings UI can say which folder went missing instead of showing an id.
	 */
	defaultFolderPath: string;
}

/** Which library an import targets. */
export type LibraryTargetMode =
	/** Whatever Eagle currently has open — never switches. */
	| 'active'
	/** A fixed library from the profile list; switches if it is not already open. */
	| 'default'
	/** Prompt for the library on every import. */
	| 'ask';

/** Which folder inside the target library an import lands in. */
export type FolderTargetMode =
	/** The target library's own `defaultFolderId`. */
	| 'library-default'
	/** Prompt for the folder on every import. */
	| 'ask'
	/** Library root, as before. */
	| 'none';

/** A folder flattened out of Eagle's nested tree, carrying its full display path. */
export interface FlatEagleFolder {
	id: string;
	name: string;
	/** Ancestors joined with `/` — `Projects/Jazz Blend`. */
	path: string;
	depth: number;
	imageCount: number;
}

/** Outcome of a library switch, which is asynchronous and briefly kills the API server. */
export interface LibrarySwitchResult {
	success: boolean;
	/** Library actually open when the attempt finished. */
	activePath: string | null;
	/** Milliseconds from request to the library reporting as open. */
	elapsedMs: number;
	error?: string;
}

export interface CloudProviderConfig {
	type: CloudProviderType;
	enabled: boolean;
	name: string;
}

export interface R2ProviderConfig extends CloudProviderConfig {
	type: 'r2';
	workerUrl: string;
	apiKey: string;
	publicUrl: string;
}

export interface S3ProviderConfig extends CloudProviderConfig {
	type: 's3';
	endpoint: string;
	region: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
	publicUrl: string;
}

export interface WebDAVProviderConfig extends CloudProviderConfig {
	type: 'webdav';
	serverUrl: string;
	username: string;
	password: string;
	uploadPath: string;
	publicUrl: string;
}

export interface ImgHippoProviderConfig extends CloudProviderConfig {
	type: 'imghippo';
	apiKey: string;
}

export interface CustomProviderConfig extends CloudProviderConfig {
	type: 'custom';
	uploadUrl: string;
	headers: Record<string, string>;
	publicUrl: string;
}

export type AnyCloudProviderConfig = R2ProviderConfig | S3ProviderConfig | WebDAVProviderConfig | ImgHippoProviderConfig | CustomProviderConfig;

export interface CloudUploadResult {
	success: boolean;
	publicUrl?: string;
	key?: string;
	filename?: string;
	error?: string;
}

export interface CMDSPACEEagleSettings {
	eagleApiBaseUrl: string;
	connectionTimeout: number;
	thumbnailCacheTTL: number;
	autoSyncOnOpen: boolean;
	tagPrefix: string;
	tagNormalization: 'lowercase' | 'preserve';
	linkFormat: 'markdown' | 'wikilink';
	insertThumbnail: boolean;
	thumbnailSize: 'small' | 'medium' | 'large';
	defaultFolder: string;
	r2WorkerUrl: string;
	r2ApiKey: string;
	r2PublicUrl: string;
	imageDisplayMode: 'local' | 'cloud' | 'both';
	embedImageInCard: boolean;
	insertAsEmbed: boolean;
	imagePasteBehavior: ImagePasteBehavior;
	linkMode: LinkMode;
	/** Pre-release v2 key — read once by the migration in `loadSettings`, then removed. */
	captureMode?: LegacyCaptureMode;
	/** Pre-release v2 key — folded into `linkMode` on load, then removed. */
	insertMetadataCard?: boolean;
	vaultThumbnailDir: string;
	deleteTempAfterImport: boolean;
	thumbnailPollTimeoutMs: number;
	thumbnailMaxKB: number;
	cardHiddenTagPrefixes: string[];
	excalidrawIntegration: boolean;
	excalidrawImportToEagle: boolean;
	activeCloudProvider: CloudProviderType;
	searchScope: SearchScope[];
	searchFileTypes: string[];
	/**
	 * How many items the search modal pre-loads. Eagle's own default is 200, which
	 * silently hid most of a library from search. Beyond this cap the modal falls
	 * back to Eagle's server-side keyword search, so nothing is unreachable.
	 */
	searchFetchLimit: number;
	cloudProviders: {
		r2: R2ProviderConfig;
		s3: S3ProviderConfig;
		webdav: WebDAVProviderConfig;
		imghippo: ImgHippoProviderConfig;
		custom: CustomProviderConfig;
	};
	enableCrossPlatform: boolean;
	autoConvertCrossPlatformPaths: boolean;
	crossPlatformConversionMode: CrossPlatformConversionMode;
	computers: ComputerProfile[];
	/** Remembered libraries and their per-library default folder. */
	libraries: EagleLibraryProfile[];
	libraryTargetMode: LibraryTargetMode;
	/** Path of the library used when `libraryTargetMode` is `default`. */
	defaultLibraryPath: string;
	/** Switch back to the previously open library once the import finishes. */
	restoreLibraryAfterImport: boolean;
	/** Give up waiting for a switched-to library to report as open. */
	librarySwitchTimeoutMs: number;
	/**
	 * Drop profiles for libraries Eagle no longer knows and that are gone from
	 * disk, as part of Scan Eagle. Off by default: a profile holds the user's
	 * default-folder choice, so removal stays a deliberate act.
	 */
	pruneMissingLibrariesOnScan: boolean;
	folderTargetMode: FolderTargetMode;
}

export const DEFAULT_SETTINGS: CMDSPACEEagleSettings = {
	eagleApiBaseUrl: 'http://localhost:41595',
	connectionTimeout: 5000,
	thumbnailCacheTTL: 3600000,
	autoSyncOnOpen: false,
	tagPrefix: '',
	tagNormalization: 'lowercase',
	linkFormat: 'markdown',
	insertThumbnail: true,
	thumbnailSize: 'medium',
	defaultFolder: '',
	r2WorkerUrl: '',
	r2ApiKey: '',
	r2PublicUrl: '',
	imageDisplayMode: 'cloud',
	embedImageInCard: true,
	insertAsEmbed: true,
	imagePasteBehavior: 'eagle',
	linkMode: 'cmds-eagle',
	vaultThumbnailDir: 'attachments/eagle',
	deleteTempAfterImport: true,
	thumbnailPollTimeoutMs: 10000,
	thumbnailMaxKB: 2048,
	cardHiddenTagPrefixes: ['cli-eagle:', 'r2:'],
	excalidrawIntegration: true,
	excalidrawImportToEagle: true,
	activeCloudProvider: 'imghippo',
	searchScope: ['name', 'tags'],
	searchFileTypes: [...SUPPORTED_IMAGE_EXTENSIONS],
	searchFetchLimit: 5000,
	cloudProviders: {
		r2: {
			type: 'r2',
			enabled: false,
			name: 'Cloudflare R2',
			workerUrl: '',
			apiKey: '',
			publicUrl: '',
		},
		s3: {
			type: 's3',
			enabled: false,
			name: 'Amazon S3',
			endpoint: '',
			region: 'us-east-1',
			bucket: '',
			accessKeyId: '',
			secretAccessKey: '',
			publicUrl: '',
		},
		webdav: {
			type: 'webdav',
			enabled: false,
			name: 'WebDAV (Synology/NAS)',
			serverUrl: '',
			username: '',
			password: '',
			uploadPath: '/eagle-uploads',
			publicUrl: '',
		},
		imghippo: {
			type: 'imghippo',
			enabled: false,
			name: 'ImgHippo',
			apiKey: '',
		},
		custom: {
			type: 'custom',
			enabled: false,
			name: 'Custom Server',
			uploadUrl: '',
			headers: {},
			publicUrl: '',
		},
	},
	// Defaults reproduce the pre-1.8 behaviour exactly: import into whatever
	// library Eagle has open, at its root. Multi-library targeting is opt-in.
	libraries: [],
	libraryTargetMode: 'active',
	defaultLibraryPath: '',
	restoreLibraryAfterImport: true,
	librarySwitchTimeoutMs: 15000,
	pruneMissingLibrariesOnScan: false,
	folderTargetMode: 'library-default',
	enableCrossPlatform: false,
	autoConvertCrossPlatformPaths: false,
	// Rewriting the note itself makes two machines take turns editing the same
	// line, which a synced vault sees as a conflict. Remap at render time instead.
	crossPlatformConversionMode: 'render-only',
	computers: [],
};

export interface AddFromPathRequest {
	path: string;
	name: string;
	folderId?: string;
	tags?: string[];
	annotation?: string;
}

export interface AddFromPathResponse {
	status: 'success' | 'error';
	data?: string;
	message?: string;
}

export interface R2UploadResult {
	success: boolean;
	key?: string;
	filename?: string;
	error?: string;
}

export interface CMDSPACELinkCard {
	type: 'eagle';
	id: string;
	url: string;
	title: string;
	tags: string[];
	source?: string;
	createdAt: string;
	updatedAt: string;
	eagle: {
		ext: string;
		size: number;
		width: number;
		height: number;
		annotation: string;
		sourceUrl: string;
		palettes: EaglePalette[];
	};
}
