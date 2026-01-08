import { promises as fs } from 'fs';
import {
	CloudUploadResult,
	R2ProviderConfig,
	S3ProviderConfig,
	WebDAVProviderConfig,
	ImgHippoProviderConfig,
	CustomProviderConfig,
	AnyCloudProviderConfig,
} from './types';

export interface CloudProvider {
	upload(filePath: string, filename: string, mimeType: string): Promise<CloudUploadResult>;
	testConnection(): Promise<boolean>;
	getPublicUrl(key: string): string;
}

function getMimeType(ext: string): string {
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
		'heic': 'image/heic',
		'heif': 'image/heif',
		'avif': 'image/avif',
		'pdf': 'application/pdf',
	};
	return MIME_TYPES[ext.toLowerCase()] || 'application/octet-stream';
}

export class R2Provider implements CloudProvider {
	constructor(private config: R2ProviderConfig) {}

	async upload(filePath: string, filename: string, mimeType: string): Promise<CloudUploadResult> {
		if (!this.config.workerUrl || !this.config.apiKey) {
			return { success: false, error: 'R2 not configured' };
		}

		try {
			const fileBuffer = await fs.readFile(filePath);
			const blob = new Blob([fileBuffer], { type: mimeType });

			const formData = new FormData();
			formData.append('file', blob, filename);
			formData.append('filename', filename);
			formData.append('content_type', mimeType);

			const response = await fetch(`${this.config.workerUrl}/upload`, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.config.apiKey}`,
				},
				body: formData,
			});

			if (!response.ok) {
				const errorText = await response.text();
				return { success: false, error: `Upload failed (${response.status}): ${errorText}` };
			}

			const result = await response.json() as { success: boolean; key: string; filename: string };
			return {
				success: true,
				key: result.key,
				filename: result.filename,
				publicUrl: this.getPublicUrl(result.key),
			};
		} catch (error) {
			return { 
				success: false, 
				error: error instanceof Error ? error.message : 'Unknown error' 
			};
		}
	}

	async testConnection(): Promise<boolean> {
		if (!this.config.workerUrl || !this.config.apiKey) {
			return false;
		}
		try {
			const response = await fetch(`${this.config.workerUrl}/health`, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${this.config.apiKey}`,
				},
			});
			return response.status === 200;
		} catch {
			return false;
		}
	}

	getPublicUrl(key: string): string {
		return `${this.config.publicUrl}/${key}`;
	}
}

export class S3Provider implements CloudProvider {
	constructor(private config: S3ProviderConfig) {}

	async upload(filePath: string, filename: string, mimeType: string): Promise<CloudUploadResult> {
		if (!this.config.endpoint || !this.config.accessKeyId || !this.config.secretAccessKey) {
			return { success: false, error: 'S3 not configured' };
		}

		try {
			const fileBuffer = await fs.readFile(filePath);
			const key = `eagle/${Date.now()}-${filename}`;
			
			const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
			const dateStamp = date.slice(0, 8);
			
			const host = new URL(this.config.endpoint).host;
			const canonicalUri = `/${this.config.bucket}/${key}`;
			const canonicalQueryString = '';
			const payloadHash = await this.sha256(fileBuffer);
			
			const canonicalHeaders = [
				`content-type:${mimeType}`,
				`host:${host}`,
				`x-amz-content-sha256:${payloadHash}`,
				`x-amz-date:${date}`,
			].join('\n') + '\n';
			
			const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
			
			const canonicalRequest = [
				'PUT',
				canonicalUri,
				canonicalQueryString,
				canonicalHeaders,
				signedHeaders,
				payloadHash,
			].join('\n');
			
			const algorithm = 'AWS4-HMAC-SHA256';
			const credentialScope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
			const stringToSign = [
				algorithm,
				date,
				credentialScope,
				await this.sha256(new TextEncoder().encode(canonicalRequest)),
			].join('\n');
			
			const signingKey = await this.getSignatureKey(
				this.config.secretAccessKey,
				dateStamp,
				this.config.region,
				's3'
			);
			const signature = await this.hmacHex(signingKey, stringToSign);
			
			const authorizationHeader = `${algorithm} Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
			
			const response = await fetch(`${this.config.endpoint}/${this.config.bucket}/${key}`, {
				method: 'PUT',
				headers: {
					'Content-Type': mimeType,
					'x-amz-content-sha256': payloadHash,
					'x-amz-date': date,
					'Authorization': authorizationHeader,
				},
				body: fileBuffer,
			});

			if (!response.ok) {
				const errorText = await response.text();
				return { success: false, error: `S3 upload failed (${response.status}): ${errorText}` };
			}

			return {
				success: true,
				key: key,
				filename: filename,
				publicUrl: this.getPublicUrl(key),
			};
		} catch (error) {
			return { 
				success: false, 
				error: error instanceof Error ? error.message : 'Unknown error' 
			};
		}
	}

	async testConnection(): Promise<boolean> {
		if (!this.config.endpoint || !this.config.accessKeyId) {
			return false;
		}
		try {
			const response = await fetch(`${this.config.endpoint}/${this.config.bucket}`, {
				method: 'HEAD',
			});
			return response.status < 500;
		} catch {
			return false;
		}
	}

	getPublicUrl(key: string): string {
		if (this.config.publicUrl) {
			return `${this.config.publicUrl}/${key}`;
		}
		return `${this.config.endpoint}/${this.config.bucket}/${key}`;
	}

	private async sha256(data: ArrayBuffer | Uint8Array): Promise<string> {
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		return Array.from(new Uint8Array(hashBuffer))
			.map(b => b.toString(16).padStart(2, '0'))
			.join('');
	}

	private async hmac(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
		const cryptoKey = await crypto.subtle.importKey(
			'raw',
			key,
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);
		return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
	}

	private async hmacHex(key: ArrayBuffer, data: string): Promise<string> {
		const sig = await this.hmac(key, data);
		return Array.from(new Uint8Array(sig))
			.map(b => b.toString(16).padStart(2, '0'))
			.join('');
	}

	private async getSignatureKey(
		key: string,
		dateStamp: string,
		region: string,
		service: string
	): Promise<ArrayBuffer> {
		const kDate = await this.hmac(new TextEncoder().encode('AWS4' + key), dateStamp);
		const kRegion = await this.hmac(kDate, region);
		const kService = await this.hmac(kRegion, service);
		return await this.hmac(kService, 'aws4_request');
	}
}

export class WebDAVProvider implements CloudProvider {
	constructor(private config: WebDAVProviderConfig) {}

	async upload(filePath: string, filename: string, mimeType: string): Promise<CloudUploadResult> {
		if (!this.config.serverUrl || !this.config.username) {
			return { success: false, error: 'WebDAV not configured' };
		}

		try {
			const fileBuffer = await fs.readFile(filePath);
			const key = `${this.config.uploadPath}/${Date.now()}-${filename}`;
			const uploadUrl = `${this.config.serverUrl}${key}`;

			const auth = btoa(`${this.config.username}:${this.config.password}`);

			const response = await fetch(uploadUrl, {
				method: 'PUT',
				headers: {
					'Authorization': `Basic ${auth}`,
					'Content-Type': mimeType,
				},
				body: fileBuffer,
			});

			if (!response.ok && response.status !== 201 && response.status !== 204) {
				return { success: false, error: `WebDAV upload failed (${response.status})` };
			}

			return {
				success: true,
				key: key,
				filename: filename,
				publicUrl: this.getPublicUrl(key),
			};
		} catch (error) {
			return { 
				success: false, 
				error: error instanceof Error ? error.message : 'Unknown error' 
			};
		}
	}

	async testConnection(): Promise<boolean> {
		if (!this.config.serverUrl || !this.config.username) {
			return false;
		}
		try {
			const auth = btoa(`${this.config.username}:${this.config.password}`);
			const response = await fetch(this.config.serverUrl, {
				method: 'PROPFIND',
				headers: {
					'Authorization': `Basic ${auth}`,
					'Depth': '0',
				},
			});
			return response.status === 207 || response.status === 200;
		} catch {
			return false;
		}
	}

	getPublicUrl(key: string): string {
		if (this.config.publicUrl) {
			return `${this.config.publicUrl}${key}`;
		}
		return `${this.config.serverUrl}${key}`;
	}
}

export class ImgHippoProvider implements CloudProvider {
	private readonly API_URL = 'https://api.imghippo.com/v1/upload';
	
	constructor(private config: ImgHippoProviderConfig) {}

	async upload(filePath: string, filename: string, mimeType: string): Promise<CloudUploadResult> {
		if (!this.config.apiKey) {
			return { success: false, error: 'ImgHippo API key not configured' };
		}

		try {
			const fileBuffer = await fs.readFile(filePath);
			const blob = new Blob([fileBuffer], { type: mimeType });

			const formData = new FormData();
			formData.append('api_key', this.config.apiKey);
			formData.append('file', blob, filename);
			formData.append('title', filename);

			const response = await fetch(this.API_URL, {
				method: 'POST',
				body: formData,
			});

			if (!response.ok) {
				const errorText = await response.text();
				return { success: false, error: `ImgHippo upload failed (${response.status}): ${errorText}` };
			}

			const result = await response.json() as {
				success: boolean;
				status: number;
				message?: string;
				data?: {
					id: string;
					title: string;
					url_viewer: string;
					url: string;
					display_url: string;
					width: string;
					height: string;
					size: string;
					time: string;
					expiration: string;
					image: {
						filename: string;
						name: string;
						mime: string;
						extension: string;
						url: string;
					};
					thumb: {
						filename: string;
						name: string;
						mime: string;
						extension: string;
						url: string;
					};
					delete_url: string;
				};
			};

			if (!result.success || !result.data) {
				return { success: false, error: result.message || 'Upload failed' };
			}

			const publicUrl = result.data.url || result.data.display_url || result.data.image?.url;
			const resultFilename = result.data.image?.filename || result.data.title || filename;

			if (!publicUrl) {
				return { success: false, error: 'No URL returned from ImgHippo' };
			}

			return {
				success: true,
				key: result.data.id,
				filename: resultFilename,
				publicUrl: publicUrl,
			};
		} catch (error) {
			return { 
				success: false, 
				error: error instanceof Error ? error.message : 'Unknown error' 
			};
		}
	}

	async testConnection(): Promise<boolean> {
		return !!this.config.apiKey;
	}

	getPublicUrl(key: string): string {
		return key;
	}
}

export class CustomProvider implements CloudProvider {
	constructor(private config: CustomProviderConfig) {}

	async upload(filePath: string, filename: string, mimeType: string): Promise<CloudUploadResult> {
		if (!this.config.uploadUrl) {
			return { success: false, error: 'Custom provider not configured' };
		}

		try {
			const fileBuffer = await fs.readFile(filePath);
			const blob = new Blob([fileBuffer], { type: mimeType });

			const formData = new FormData();
			formData.append('file', blob, filename);
			formData.append('filename', filename);

			const response = await fetch(this.config.uploadUrl, {
				method: 'POST',
				headers: this.config.headers,
				body: formData,
			});

			if (!response.ok) {
				const errorText = await response.text();
				return { success: false, error: `Upload failed (${response.status}): ${errorText}` };
			}

			const result = await response.json() as { key?: string; url?: string; filename?: string };
			const key = result.key || result.url || filename;
			
			return {
				success: true,
				key: key,
				filename: result.filename || filename,
				publicUrl: this.getPublicUrl(key),
			};
		} catch (error) {
			return { 
				success: false, 
				error: error instanceof Error ? error.message : 'Unknown error' 
			};
		}
	}

	async testConnection(): Promise<boolean> {
		if (!this.config.uploadUrl) {
			return false;
		}
		try {
			const response = await fetch(this.config.uploadUrl, {
				method: 'HEAD',
				headers: this.config.headers,
			});
			return response.status < 500;
		} catch {
			return false;
		}
	}

	getPublicUrl(key: string): string {
		if (this.config.publicUrl) {
			return key.startsWith('http') ? key : `${this.config.publicUrl}/${key}`;
		}
		return key;
	}
}

export function createCloudProvider(config: AnyCloudProviderConfig): CloudProvider | null {
	switch (config.type) {
		case 'r2':
			return new R2Provider(config as R2ProviderConfig);
		case 's3':
			return new S3Provider(config as S3ProviderConfig);
		case 'webdav':
			return new WebDAVProvider(config as WebDAVProviderConfig);
		case 'imghippo':
			return new ImgHippoProvider(config as ImgHippoProviderConfig);
		case 'custom':
			return new CustomProvider(config as CustomProviderConfig);
		default:
			return null;
	}
}

export function getExtFromFilename(filename: string): string {
	const parts = filename.split('.');
	return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

export { getMimeType };
