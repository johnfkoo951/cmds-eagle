// Canonical markdown output contract, protected by golden-string tests:
//
//   [![hero shot](attachments/eagle/KXYZ01.png)](eagle://item/KXYZ01)
//   > `png` · 4.2 MB · 1920×1080 · #ui #ref · [Eagle에서 열기](eagle://item/KXYZ01)
//
// Rules: thumbnail filename is always keyed by item id, the image path is
// relative to the note file, and the metadata card is exactly one line.
// Keep the implementation and contract tests in sync when changing the rendered form.

import type { LinkMode } from './types';

const CARD_SEPARATOR = ' · ';
const OPEN_IN_EAGLE_LABEL = 'Eagle에서 열기';

export interface CanonicalItem {
	id: string;
	name: string;
	ext: string;
	size: number;
	width: number;
	height: number;
	tags: string[];
}

export interface CanonicalRenderOptions {
	mode: LinkMode;
	/** Note-relative thumbnail path. When null, the photo modes fall back to a deep link. */
	thumbnailRelativePath: string | null;
	/** Absolute `file://` URL of the original. Only the `cmds-eagle*` modes use it. */
	fileUrl?: string | null;
	hiddenTagPrefixes: string[];
	normalizeTag?: (tag: string) => string;
	/** Suppresses the metadata card for inline replacements, where it would break the text. */
	includeCard?: boolean;
}

const MODES_WITH_CARD: ReadonlySet<LinkMode> = new Set<LinkMode>(['photo-info', 'cmds-eagle']);

/** Only the photo modes put a copy of the thumbnail in the vault. */
export function modeNeedsThumbnail(mode: LinkMode): boolean {
	return mode === 'photo-info' || mode === 'photo-only';
}

/** The original-photo modes point straight at the mounted Eagle library. */
export function modeUsesOriginalFile(mode: LinkMode): boolean {
	return mode === 'cmds-eagle'
		|| mode === 'cmds-eagle-photo-only'
		|| mode === 'cmds-eagle-photo-link';
}

export function eagleDeeplink(itemId: string): string {
	return `eagle://item/${itemId}`;
}

/** `<assetsDir>/<itemId>.<ext>` — the vault-relative location of a copied thumbnail. */
export function thumbnailVaultPath(assetsDir: string, itemId: string, ext: string): string {
	const dir = assetsDir.replace(/^\/+|\/+$/g, '');
	return dir ? `${dir}/${itemId}.${ext}` : `${itemId}.${ext}`;
}

/**
 * Vault-absolute target path expressed relative to the note that links to it.
 * Both inputs are vault-relative POSIX paths; the note path includes its filename.
 */
export function toNoteRelativePath(notePath: string, targetVaultPath: string): string {
	const noteDir = notePath.split('/').slice(0, -1).filter(Boolean);
	const target = targetVaultPath.split('/').filter(Boolean);

	let shared = 0;
	while (shared < noteDir.length && shared < target.length - 1 && noteDir[shared] === target[shared]) {
		shared++;
	}

	const ascend: string[] = [];
	for (let i = shared; i < noteDir.length; i++) {
		ascend.push('..');
	}
	return ascend.concat(target.slice(shared)).join('/');
}

export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Percent-encode the characters that would terminate a markdown link target. */
export function encodeMarkdownPath(path: string): string {
	return path
		.replace(/%/g, '%25')
		.replace(/ /g, '%20')
		.replace(/\(/g, '%28')
		.replace(/\)/g, '%29');
}

export function escapeMarkdownAltText(text: string): string {
	return text.replace(/([[\]])/g, '\\$1');
}

/** Drop marker tags (`cli-eagle:`, `r2:` …) that exist for tooling, not for readers. */
export function filterMarkerTags(tags: string[], hiddenPrefixes: string[]): string[] {
	return tags.filter(tag => !hiddenPrefixes.some(prefix => tag.startsWith(prefix)));
}

/**
 * The one-line metadata card. Segments with no value are omitted rather than
 * rendered as "N/A" — a pdf has no dimensions and an untagged item has no tags.
 */
export function buildMetadataCard(item: CanonicalItem, options: CanonicalRenderOptions): string {
	const normalize = options.normalizeTag ?? ((tag: string) => tag);
	const segments: string[] = [`\`${item.ext.toLowerCase()}\``, formatFileSize(item.size)];

	if (item.width && item.height) {
		segments.push(`${item.width}×${item.height}`);
	}

	const tags = filterMarkerTags(item.tags, options.hiddenTagPrefixes)
		.map(tag => `#${normalize(tag)}`)
		.join(' ');
	if (tags) {
		segments.push(tags);
	}

	segments.push(`[${OPEN_IN_EAGLE_LABEL}](${eagleDeeplink(item.id)})`);
	return `> ${segments.join(CARD_SEPARATOR)}`;
}

/**
 * The line (or two) that goes into the note. The original-photo modes use a
 * `file://` URL when available; every file-backed mode degrades to a plain deep
 * link when its input is missing — never to a temp-file reference.
 */
export function buildCanonicalEmbed(item: CanonicalItem, options: CanonicalRenderOptions): string {
	const alt = escapeMarkdownAltText(item.name);
	const deeplink = eagleDeeplink(item.id);
	const linkOnly = `[${alt}](${deeplink})`;

	let embed: string;
	switch (options.mode) {
		case 'link-only':
			embed = linkOnly;
			break;
		case 'cmds-eagle':
		case 'cmds-eagle-photo-only':
			embed = options.fileUrl ? `![${alt}](${options.fileUrl})` : linkOnly;
			break;
		case 'cmds-eagle-photo-link':
			embed = options.fileUrl ? `[![${alt}](${options.fileUrl})](${deeplink})` : linkOnly;
			break;
		default:
			embed = options.thumbnailRelativePath
				? `[![${alt}](${encodeMarkdownPath(options.thumbnailRelativePath)})](${deeplink})`
				: linkOnly;
	}

	const wantsCard = (options.includeCard ?? true) && MODES_WITH_CARD.has(options.mode);
	return wantsCard ? `${embed}\n${buildMetadataCard(item, options)}` : embed;
}
