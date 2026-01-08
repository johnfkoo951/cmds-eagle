import { requestUrl, RequestUrlResponse } from 'obsidian';
import { promises as fs } from 'fs';
import {
	EagleApiResponse,
	EagleItem,
	EagleFolder,
	EagleLibraryInfo,
	EagleApplicationInfo,
	CMDSPACEEagleSettings,
	R2UploadResult,
} from './types';

export class EagleApiService {
	private baseUrl: string;
	private timeout: number;
	private r2WorkerUrl: string;
	private r2ApiKey: string;
	private r2PublicUrl: string;

	constructor(settings: CMDSPACEEagleSettings) {
		this.baseUrl = settings.eagleApiBaseUrl;
		this.timeout = settings.connectionTimeout;
		this.r2WorkerUrl = settings.r2WorkerUrl;
		this.r2ApiKey = settings.r2ApiKey;
		this.r2PublicUrl = settings.r2PublicUrl;
	}

	updateSettings(settings: CMDSPACEEagleSettings): void {
		this.baseUrl = settings.eagleApiBaseUrl;
		this.timeout = settings.connectionTimeout;
		this.r2WorkerUrl = settings.r2WorkerUrl;
		this.r2ApiKey = settings.r2ApiKey;
		this.r2PublicUrl = settings.r2PublicUrl;
	}

	async isConnected(): Promise<boolean> {
		try {
			const info = await this.getApplicationInfo();
			return info !== null;
		} catch {
			return false;
		}
	}

	async getApplicationInfo(): Promise<EagleApplicationInfo | null> {
		try {
			const response = await this.get<EagleApplicationInfo>('/api/application/info');
			return response.data ?? null;
		} catch {
			return null;
		}
	}

	async listItems(options?: {
		keyword?: string;
		tags?: string[];
		folders?: string[];
		ext?: string;
		limit?: number;
		offset?: number;
		orderBy?: string;
	}): Promise<EagleItem[]> {
		const params = new URLSearchParams();
		
		if (options?.keyword) params.append('keyword', options.keyword);
		if (options?.tags?.length) params.append('tags', options.tags.join(','));
		if (options?.folders?.length) params.append('folders', options.folders.join(','));
		if (options?.ext) params.append('ext', options.ext);
		if (options?.limit) params.append('limit', options.limit.toString());
		if (options?.offset) params.append('offset', options.offset.toString());
		if (options?.orderBy) params.append('orderBy', options.orderBy);

		const queryString = params.toString();
		const endpoint = queryString ? `/api/item/list?${queryString}` : '/api/item/list';
		
		const response = await this.get<EagleItem[]>(endpoint);
		return response.data ?? [];
	}

	async getItemInfo(id: string): Promise<EagleItem | null> {
		try {
			const response = await this.get<EagleItem>(`/api/item/info?id=${id}`);
			return response.data ?? null;
		} catch {
			return null;
		}
	}

	async getThumbnailPath(id: string): Promise<string | null> {
		try {
			const response = await this.get<string>(`/api/item/thumbnail?id=${id}`);
			return response.data ?? null;
		} catch {
			return null;
		}
	}

	async updateItem(
		id: string,
		updates: {
			tags?: string[];
			annotation?: string;
			url?: string;
			star?: number;
		}
	): Promise<boolean> {
		try {
			const response = await this.post<null>('/api/item/update', {
				id,
				...updates,
			});
			return response.status === 'success';
		} catch {
			return false;
		}
	}

	async addFromUrl(options: {
		url: string;
		name: string;
		website?: string;
		tags?: string[];
		annotation?: string;
		folderId?: string;
	}): Promise<boolean> {
		try {
			const response = await this.post<null>('/api/item/addFromURL', options);
			return response.status === 'success';
		} catch {
			return false;
		}
	}

	async addFromPath(options: {
		path: string;
		name: string;
		website?: string;
		tags?: string[];
		annotation?: string;
		folderId?: string;
	}): Promise<{ success: boolean; itemId?: string }> {
		try {
			const response = await this.post<string>('/api/item/addFromPath', options);
			if (response.status === 'success' && response.data) {
				return { success: true, itemId: response.data };
			}
			return { success: false };
		} catch {
			return { success: false };
		}
	}

	async listFolders(): Promise<EagleFolder[]> {
		try {
			const response = await this.get<EagleFolder[]>('/api/folder/list');
			return response.data ?? [];
		} catch {
			return [];
		}
	}

	async getLibraryInfo(): Promise<EagleLibraryInfo | null> {
		try {
			const response = await this.get<EagleLibraryInfo>('/api/library/info');
			return response.data ?? null;
		} catch {
			return null;
		}
	}

	async getLibraryPath(): Promise<string | null> {
		try {
			const response = await this.get<{ library: string }>('/api/library/info');
			const data = response.data as unknown as { library?: string; path?: string };
			return data?.library || data?.path || null;
		} catch {
			return null;
		}
	}

	async refreshThumbnail(id: string): Promise<boolean> {
		try {
			const response = await this.post<null>('/api/item/refreshThumbnail', { id });
			return response.status === 'success';
		} catch {
			return false;
		}
	}

	async testR2Connection(): Promise<boolean> {
		if (!this.r2WorkerUrl || !this.r2ApiKey) {
			return false;
		}
		try {
			const response = await requestUrl({
				url: `${this.r2WorkerUrl}/health`,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${this.r2ApiKey}`,
				},
			});
			return response.status === 200;
		} catch {
			return false;
		}
	}

	async getOriginalFilePath(item: EagleItem): Promise<string | null> {
		const thumbnailPath = await this.getThumbnailPath(item.id);
		if (!thumbnailPath) {
			console.log('[CMDS Eagle] getThumbnailPath returned null for item:', item.id);
			return null;
		}

		console.log('[CMDS Eagle] thumbnailPath:', thumbnailPath);
		
		const decodedPath = this.safeDecodeUri(thumbnailPath);
		const folderPath = decodedPath.substring(0, decodedPath.lastIndexOf('/'));
		const originalPath = `${folderPath}/${item.name}.${item.ext}`;
		
		console.log('[CMDS Eagle] originalPath:', originalPath);
		return originalPath;
	}

	private safeDecodeUri(str: string): string {
		try {
			return decodeURIComponent(str);
		} catch {
			return str;
		}
	}

	async uploadToR2(item: EagleItem): Promise<R2UploadResult> {
		if (!this.r2WorkerUrl || !this.r2ApiKey || !this.r2PublicUrl) {
			return { success: false, error: 'R2 settings not configured' };
		}

		const existingKey = getR2KeyFromItem(item);
		if (existingKey) {
			return { 
				success: true, 
				key: existingKey,
				filename: item.name,
			};
		}

		try {
			const filePath = await this.getOriginalFilePath(item);
			if (!filePath) {
				return { success: false, error: 'Could not get file path from Eagle' };
			}

			let fileBuffer: Buffer;
			try {
				fileBuffer = await fs.readFile(filePath);
			} catch (fsError) {
				return { 
					success: false, 
					error: `Could not read file: ${filePath}` 
				};
			}

			const mimeType = getMimeType(item.ext);
			const blob = new Blob([fileBuffer], { type: mimeType });
			const filename = `${item.name}.${item.ext}`;

			const formData = new FormData();
			formData.append('file', blob, filename);
			formData.append('filename', filename);
			formData.append('content_type', mimeType);
			formData.append('eagle_id', item.id);

			const response = await fetch(`${this.r2WorkerUrl}/upload`, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.r2ApiKey}`,
				},
				body: formData,
			});

			if (!response.ok) {
				const errorText = await response.text();
				return { success: false, error: `Upload failed (${response.status}): ${errorText}` };
			}

			const result = await response.json() as { success: boolean; key: string; filename: string };
			
			const r2Tag = `r2:${result.key}`;
			const newTags = [...item.tags];
			if (!newTags.includes(r2Tag)) {
				newTags.push(r2Tag);
			}
			if (!newTags.includes('r2-cloud')) {
				newTags.push('r2-cloud');
			}
			await this.updateItem(item.id, { tags: newTags });

			return {
				success: true,
				key: result.key,
				filename: result.filename,
			};
		} catch (error) {
			return { 
				success: false, 
				error: error instanceof Error ? error.message : 'Unknown error' 
			};
		}
	}

	getCloudUrl(item: EagleItem): string | null {
		const key = getR2KeyFromItem(item);
		if (!key || !this.r2PublicUrl) {
			return null;
		}
		return `${this.r2PublicUrl}/${key}`;
	}

	getLocalThumbnailUrl(id: string): string {
		return `${this.baseUrl}/api/item/thumbnail?id=${id}`;
	}

	private async get<T>(endpoint: string): Promise<EagleApiResponse<T>> {
		const response: RequestUrlResponse = await requestUrl({
			url: `${this.baseUrl}${endpoint}`,
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		});
		return response.json as EagleApiResponse<T>;
	}

	private async post<T>(endpoint: string, body: unknown): Promise<EagleApiResponse<T>> {
		const response: RequestUrlResponse = await requestUrl({
			url: `${this.baseUrl}${endpoint}`,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		});
		return response.json as EagleApiResponse<T>;
	}
}

export function buildEagleItemUrl(itemId: string): string {
	return `eagle://item/${itemId}`;
}

export function buildEagleFolderUrl(folderId: string): string {
	return `eagle://folder/${folderId}`;
}

export function parseEagleUrl(url: string): { type: 'item' | 'folder'; id: string } | null {
	const itemMatch = url.match(/^eagle:\/\/item\/([A-Z0-9]+)$/i);
	if (itemMatch) {
		return { type: 'item', id: itemMatch[1] };
	}

	const folderMatch = url.match(/^eagle:\/\/folder\/([A-Z0-9]+)$/i);
	if (folderMatch) {
		return { type: 'folder', id: folderMatch[1] };
	}

	return null;
}

export function parseEagleLocalhostUrl(url: string): string | null {
	const match = url.match(/^https?:\/\/localhost:\d+\/item\?id=([A-Z0-9]+)$/i);
	if (match) {
		return match[1];
	}
	return null;
}

export function isEagleLocalhostUrl(url: string): boolean {
	return /^https?:\/\/localhost:\d+\/item\?id=[A-Z0-9]+$/i.test(url);
}

export function buildEagleLocalhostThumbnailUrl(baseUrl: string, id: string): string {
	return `${baseUrl}/api/item/thumbnail?id=${id}`;
}

export function getR2KeyFromItem(item: EagleItem): string | null {
	const r2Tag = item.tags.find(t => t.startsWith('r2:'));
	if (r2Tag) {
		return r2Tag.slice(3);
	}
	return null;
}

export function hasR2Upload(item: EagleItem): boolean {
	return item.tags.some(t => t.startsWith('r2:'));
}

const MIME_TYPES: Record<string, string> = {
	'jpg': 'image/jpeg',
	'jpeg': 'image/jpeg',
	'png': 'image/png',
	'gif': 'image/gif',
	'webp': 'image/webp',
	'svg': 'image/svg+xml',
	'bmp': 'image/bmp',
	'ico': 'image/x-icon',
	'tiff': 'image/tiff',
	'tif': 'image/tiff',
};

function getMimeType(ext: string): string {
	return MIME_TYPES[ext.toLowerCase()] || 'application/octet-stream';
}
