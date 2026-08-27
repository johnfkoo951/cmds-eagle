// Thumbnail bytes are copied *into the vault* so notes render on every device.
// The Eagle library lives on cloud-synced storage whose absolute path is not
// stable across reconnects or machines, so a `file://` reference into it is
// structurally unusable.

import type { Vault } from 'obsidian';

import { fsp } from './fs-utils';
import { thumbnailVaultPath } from './canonical';

const POLL_INITIAL_DELAY_MS = 200;
const POLL_BACKOFF_FACTOR = 2;
const POLL_MAX_DELAY_MS = 1600;
const BYTES_PER_KB = 1024;

export interface ThumbnailPollOptions {
	timeoutMs: number;
	getThumbnailPath: (itemId: string) => Promise<string | null>;
}

export interface VaultAssetRequest {
	itemId: string;
	assetsDir: string;
	maxKB: number;
}

export interface VaultAssetResult {
	vaultPath: string;
	/** false when the asset was already present — re-inserting the same item is idempotent. */
	copied: boolean;
	sizeKB: number;
	oversized: boolean;
}

function delay(ms: number): Promise<void> {
	return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function readableFileSize(absolutePath: string): Promise<number | null> {
	try {
		const stats = await fsp.stat(absolutePath);
		return stats.isFile() ? stats.size : null;
	} catch {
		return null;
	}
}

/** Eagle names thumbnails `<original>_thumbnail.<ext>`; small images have none. */
function stripThumbnailSuffix(absolutePath: string): string {
	return absolutePath.replace(/_thumbnail(\.[A-Za-z0-9]+)$/, '$1');
}

function safeDecodeUri(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/**
 * Filesystem paths to try for a thumbnail path reported by Eagle, most likely
 * first. Eagle percent-encodes the path it returns (`My%20Library.library`), and
 * it reports the original for items it never generated a thumbnail for — so both
 * the decoded form and the suffix-stripped form are candidates.
 */
export function thumbnailCandidatePaths(reported: string): string[] {
	const decoded = safeDecodeUri(reported);
	const bases = decoded === reported ? [reported] : [decoded, reported];

	const candidates: string[] = [];
	for (const base of bases) {
		for (const candidate of [base, stripThumbnailSuffix(base)]) {
			if (!candidates.includes(candidate)) {
				candidates.push(candidate);
			}
		}
	}
	return candidates;
}

function extensionOf(absolutePath: string): string {
	const match = absolutePath.match(/\.([A-Za-z0-9]+)$/);
	return match ? match[1].toLowerCase() : 'png';
}

/**
 * Waits for Eagle to finish generating the thumbnail instead of relying on a
 * hardcoded `delay(1000)`. Resolves to a path that exists on disk, or null
 * on timeout — callers must fall back to a deep link, never to a temp file.
 */
export async function pollThumbnailPath(
	itemId: string,
	options: ThumbnailPollOptions
): Promise<string | null> {
	const deadline = Date.now() + options.timeoutMs;
	let wait = POLL_INITIAL_DELAY_MS;

	for (;;) {
		const reported = await options.getThumbnailPath(itemId);
		if (reported) {
			for (const candidate of thumbnailCandidatePaths(reported)) {
				if ((await readableFileSize(candidate)) !== null) {
					return candidate;
				}
			}
		}

		if (Date.now() + wait >= deadline) {
			return null;
		}
		await delay(wait);
		wait = Math.min(wait * POLL_BACKOFF_FACTOR, POLL_MAX_DELAY_MS);
	}
}

/**
 * Copies the thumbnail into `<assetsDir>/<itemId>.<ext>`. Keyed by item id, so
 * renaming an item in Eagle cannot orphan the asset and re-running is a no-op.
 * Returns null when the source cannot be read (dehydrated cloud placeholder).
 */
export async function copyThumbnailToVault(
	vault: Vault,
	sourceAbsolutePath: string,
	request: VaultAssetRequest
): Promise<VaultAssetResult | null> {
	const sourceSize = await readableFileSize(sourceAbsolutePath);
	if (sourceSize === null) {
		return null;
	}

	const ext = extensionOf(sourceAbsolutePath);
	const vaultPath = thumbnailVaultPath(request.assetsDir, request.itemId, ext);
	const sizeKB = Math.round(sourceSize / BYTES_PER_KB);
	const oversized = sizeKB > request.maxKB;

	const adapter = vault.adapter;
	if (await adapter.exists(vaultPath)) {
		return { vaultPath, copied: false, sizeKB, oversized };
	}

	await ensureVaultDir(vault, vaultPath);

	let bytes: Buffer;
	try {
		bytes = await fsp.readFile(sourceAbsolutePath);
	} catch (error) {
		console.error('[CMDS Eagle] Failed to read thumbnail source:', sourceAbsolutePath, error);
		return null;
	}

	await adapter.writeBinary(vaultPath, toArrayBuffer(bytes));
	return { vaultPath, copied: true, sizeKB, oversized };
}

async function ensureVaultDir(vault: Vault, vaultFilePath: string): Promise<void> {
	const segments = vaultFilePath.split('/').slice(0, -1);
	let current = '';
	for (const segment of segments) {
		current = current ? `${current}/${segment}` : segment;
		if (!(await vault.adapter.exists(current))) {
			await vault.adapter.mkdir(current);
		}
	}
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
	const copy = new Uint8Array(buffer.length);
	copy.set(buffer);
	return copy.buffer;
}
