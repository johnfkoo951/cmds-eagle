// These golden-string tests protect the canonical output contract. Any change
// to the rendered form must update the implementation and expectations deliberately.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	buildCanonicalEmbed,
	buildMetadataCard,
	encodeMarkdownPath,
	escapeMarkdownAltText,
	filterMarkerTags,
	formatFileSize,
	modeNeedsThumbnail,
	modeUsesOriginalFile,
	thumbnailVaultPath,
	toNoteRelativePath,
} from '../src/canonical.ts';

import type { CanonicalItem, CanonicalRenderOptions } from '../src/canonical.ts';

const HERO_SHOT: CanonicalItem = {
	id: 'KXYZ01',
	name: 'hero shot',
	ext: 'png',
	size: 4404019, // 4.2 MB
	width: 1920,
	height: 1080,
	tags: ['ui', 'ref'],
};

const DEFAULT_OPTIONS: CanonicalRenderOptions = {
	mode: 'photo-info',
	thumbnailRelativePath: 'attachments/eagle/KXYZ01.png',
	fileUrl: 'file:///Volumes/Assets/demo%20library.library/images/KXYZ01.info/hero%20shot.png',
	hiddenTagPrefixes: ['cli-eagle:', 'r2:'],
};

const CARD = '> `png` · 4.2 MB · 1920×1080 · #ui #ref · [Open in Eagle](eagle://item/KXYZ01)';
const LINKED_THUMBNAIL = '[![hero shot](attachments/eagle/KXYZ01.png)](eagle://item/KXYZ01)';

test('photo-info renders the thumbnail and the card', () => {
	assert.equal(buildCanonicalEmbed(HERO_SHOT, DEFAULT_OPTIONS), `${LINKED_THUMBNAIL}\n${CARD}`);
});

test('photo-only renders the thumbnail alone', () => {
	assert.equal(
		buildCanonicalEmbed(HERO_SHOT, { ...DEFAULT_OPTIONS, mode: 'photo-only' }),
		LINKED_THUMBNAIL
	);
});

test('link-only renders a deep link and copies nothing', () => {
	assert.equal(
		buildCanonicalEmbed(HERO_SHOT, { ...DEFAULT_OPTIONS, mode: 'link-only' }),
		'[hero shot](eagle://item/KXYZ01)'
	);
	assert.equal(modeNeedsThumbnail('link-only'), false);
});

test('cmds-eagle embeds the original by absolute path, with the card', () => {
	assert.equal(
		buildCanonicalEmbed(HERO_SHOT, { ...DEFAULT_OPTIONS, mode: 'cmds-eagle' }),
		'![hero shot](file:///Volumes/Assets/demo%20library.library/images/KXYZ01.info/hero%20shot.png)'
			+ `\n${CARD}`
	);
	assert.equal(modeNeedsThumbnail('cmds-eagle'), false);
});

test('cmds-eagle-photo-only embeds the original without a metadata card', () => {
	assert.equal(
		buildCanonicalEmbed(HERO_SHOT, { ...DEFAULT_OPTIONS, mode: 'cmds-eagle-photo-only' }),
		'![hero shot](file:///Volumes/Assets/demo%20library.library/images/KXYZ01.info/hero%20shot.png)'
	);
	assert.equal(modeNeedsThumbnail('cmds-eagle-photo-only'), false);
});

test('cmds-eagle-photo-link wraps the original photo in its Eagle deep link', () => {
	assert.equal(
		buildCanonicalEmbed(HERO_SHOT, { ...DEFAULT_OPTIONS, mode: 'cmds-eagle-photo-link' }),
		'[![hero shot](file:///Volumes/Assets/demo%20library.library/images/KXYZ01.info/hero%20shot.png)]'
			+ '(eagle://item/KXYZ01)'
	);
	assert.equal(modeNeedsThumbnail('cmds-eagle-photo-link'), false);
});

test('only the photo modes copy bytes into the vault', () => {
	assert.equal(modeNeedsThumbnail('photo-info'), true);
	assert.equal(modeNeedsThumbnail('photo-only'), true);
});

test('only the original-photo modes resolve a file from the Eagle library', () => {
	assert.equal(modeUsesOriginalFile('cmds-eagle'), true);
	assert.equal(modeUsesOriginalFile('cmds-eagle-photo-only'), true);
	assert.equal(modeUsesOriginalFile('cmds-eagle-photo-link'), true);
	assert.equal(modeUsesOriginalFile('photo-info'), false);
	assert.equal(modeUsesOriginalFile('photo-only'), false);
	assert.equal(modeUsesOriginalFile('link-only'), false);
});

test('photo modes fall back to a deep link when no thumbnail is available', () => {
	for (const mode of ['photo-info', 'photo-only'] as const) {
		const embed = buildCanonicalEmbed(HERO_SHOT, { ...DEFAULT_OPTIONS, mode, thumbnailRelativePath: null });

		assert.equal(embed.split('\n')[0], '[hero shot](eagle://item/KXYZ01)');
		assert.ok(!embed.includes('file://'), `${mode} must never emit a machine-local path`);
	}
});

test('cmds-eagle falls back to a deep link when the original cannot be resolved', () => {
	const embed = buildCanonicalEmbed(HERO_SHOT, { ...DEFAULT_OPTIONS, mode: 'cmds-eagle', fileUrl: null });

	assert.equal(embed, `[hero shot](eagle://item/KXYZ01)\n${CARD}`);
});

test('cmds-eagle-photo-only falls back to a deep link without a metadata card', () => {
	const embed = buildCanonicalEmbed(HERO_SHOT, {
		...DEFAULT_OPTIONS,
		mode: 'cmds-eagle-photo-only',
		fileUrl: null,
	});

	assert.equal(embed, '[hero shot](eagle://item/KXYZ01)');
});

test('cmds-eagle-photo-link falls back to a visible deep link when the original is unavailable', () => {
	const embed = buildCanonicalEmbed(HERO_SHOT, {
		...DEFAULT_OPTIONS,
		mode: 'cmds-eagle-photo-link',
		fileUrl: null,
	});

	assert.equal(embed, '[hero shot](eagle://item/KXYZ01)');
});

test('includeCard:false suppresses the card for inline replacements', () => {
	assert.equal(
		buildCanonicalEmbed(HERO_SHOT, { ...DEFAULT_OPTIONS, includeCard: false }),
		LINKED_THUMBNAIL
	);
});

test('includeCard:false keeps the original photo linked for inline replacements', () => {
	assert.equal(
		buildCanonicalEmbed(HERO_SHOT, {
			...DEFAULT_OPTIONS,
			mode: 'cmds-eagle-photo-link',
			includeCard: false,
		}),
		'[![hero shot](file:///Volumes/Assets/demo%20library.library/images/KXYZ01.info/hero%20shot.png)]'
			+ '(eagle://item/KXYZ01)'
	);
});

test('the card is exactly one line and drops empty segments', () => {
	const pdf: CanonicalItem = { ...HERO_SHOT, ext: 'pdf', width: 0, height: 0, tags: [] };
	const card = buildMetadataCard(pdf, DEFAULT_OPTIONS);

	assert.equal(card, '> `pdf` · 4.2 MB · [Open in Eagle](eagle://item/KXYZ01)');
	assert.equal(card.split('\n').length, 1);
});

test('marker tags stay out of the card', () => {
	const tagged: CanonicalItem = { ...HERO_SHOT, tags: ['ui', 'cli-eagle:batch7', 'r2:uploaded', 'ref'] };

	assert.equal(
		buildMetadataCard(tagged, DEFAULT_OPTIONS),
		'> `png` · 4.2 MB · 1920×1080 · #ui #ref · [Open in Eagle](eagle://item/KXYZ01)'
	);
});

test('tag normalisation runs after marker filtering', () => {
	const tagged: CanonicalItem = { ...HERO_SHOT, tags: ['UI Kit', 'r2:uploaded'] };
	const card = buildMetadataCard(tagged, {
		...DEFAULT_OPTIONS,
		normalizeTag: (tag: string) => `img/${tag.replace(/\s+/g, '-').toLowerCase()}`,
	});

	assert.ok(card.includes('#img/ui-kit'));
	assert.ok(!card.includes('r2:'), 'a prefixed normaliser must not resurrect marker tags');
});

test('filterMarkerTags keeps unprefixed tags', () => {
	assert.deepEqual(filterMarkerTags(['a', 'r2:x', 'b'], ['r2:']), ['a', 'b']);
});

test('thumbnail paths are keyed by item id', () => {
	assert.equal(thumbnailVaultPath('attachments/eagle', 'KXYZ01', 'png'), 'attachments/eagle/KXYZ01.png');
	assert.equal(thumbnailVaultPath('/attachments/eagle/', 'KXYZ01', 'png'), 'attachments/eagle/KXYZ01.png');
	assert.equal(thumbnailVaultPath('', 'KXYZ01', 'png'), 'KXYZ01.png');
});

test('image paths are relative to the note, at any depth', () => {
	assert.equal(
		toNoteRelativePath('Projects/Rebrand/note.md', 'attachments/eagle/KXYZ01.png'),
		'../../attachments/eagle/KXYZ01.png'
	);
	assert.equal(
		toNoteRelativePath('note.md', 'attachments/eagle/KXYZ01.png'),
		'attachments/eagle/KXYZ01.png'
	);
	assert.equal(
		toNoteRelativePath('attachments/eagle/note.md', 'attachments/eagle/KXYZ01.png'),
		'KXYZ01.png'
	);
	assert.equal(
		toNoteRelativePath('a/b/note.md', 'a/c/KXYZ01.png'),
		'../c/KXYZ01.png'
	);
});

test('file sizes match the card format', () => {
	assert.equal(formatFileSize(512), '512 B');
	assert.equal(formatFileSize(2048), '2.0 KB');
	assert.equal(formatFileSize(4404019), '4.2 MB');
});

test('link targets survive spaces and parentheses', () => {
	assert.equal(encodeMarkdownPath('my folder/a (1).png'), 'my%20folder/a%20%281%29.png');
	assert.equal(encodeMarkdownPath('100%.png'), '100%25.png');
});

test('non-ASCII names are left intact for Obsidian to resolve', () => {
	assert.equal(encodeMarkdownPath('첨부/이미지.png'), '첨부/이미지.png');
});

test('brackets in item names cannot break the markdown link', () => {
	const bracketed: CanonicalItem = { ...HERO_SHOT, name: 'shot [v2]' };

	assert.equal(escapeMarkdownAltText('shot [v2]'), 'shot \\[v2\\]');
	assert.ok(buildCanonicalEmbed(bracketed, DEFAULT_OPTIONS).startsWith('[![shot \\[v2\\]]('));
});

test('an uploaded item keeps its cloud link in the card', () => {
	assert.equal(
		buildMetadataCard(HERO_SHOT, { ...DEFAULT_OPTIONS, cloudUrl: 'https://cdn.example.com/KXYZ01.png' }),
		'> `png` · 4.2 MB · 1920×1080 · #ui #ref · [Cloud](https://cdn.example.com/KXYZ01.png) · [Open in Eagle](eagle://item/KXYZ01)'
	);
});

test('the cloud segment is omitted when the item has no cloud copy', () => {
	for (const cloudUrl of [null, undefined, '']) {
		const card = buildMetadataCard(HERO_SHOT, { ...DEFAULT_OPTIONS, cloudUrl });
		assert.ok(!card.includes('[Cloud]'), `cloudUrl=${JSON.stringify(cloudUrl)} must not render a segment`);
		assert.equal(card.split('\n').length, 1);
	}
});
