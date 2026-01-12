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

export type ImagePasteBehavior = 'eagle' | 'local' | 'cloud' | 'ask';

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
	subPath: string;
	eagleLibraryPath: string;
	isCurrentComputer?: boolean;
}

export type CrossPlatformConversionMode = 'modify-source' | 'render-only';

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
	activeCloudProvider: CloudProviderType;
	searchScope: SearchScope[];
	searchFileTypes: string[];
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
	imagePasteBehavior: 'ask',
	activeCloudProvider: 'imghippo',
	searchScope: ['name', 'tags'],
	searchFileTypes: [...SUPPORTED_IMAGE_EXTENSIONS],
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
	enableCrossPlatform: false,
	autoConvertCrossPlatformPaths: false,
	crossPlatformConversionMode: 'modify-source',
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
