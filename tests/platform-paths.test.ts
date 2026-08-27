// Remapping runs on paths that are already committed to notes, so a wrong answer
// silently breaks images on the other machine. These tests pin the three path
// shapes (POSIX, Windows drive, UNC), the root-boundary rules, and the encoding
// round trip.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	extractPathFromImageSrc,
	fileUrlToPath,
	findCurrentComputer,
	isAbsolutePath,
	matchLibraryRoot,
	normalizePath,
	pathToFileUrl,
	pathToResourceUrl,
	profileLibraryRoot,
	remapPathToComputer,
} from '../src/platform-paths.ts';

import type { ComputerProfile } from '../src/types.ts';

function computer(overrides: Partial<ComputerProfile> & { id: string }): ComputerProfile {
	return {
		name: overrides.id,
		platform: 'darwin',
		username: '',
		subPath: '',
		eagleLibraryPath: '',
		...overrides,
	};
}

const MAC = computer({
	id: 'mac',
	platform: 'darwin',
	username: 'alice',
	eagleLibraryPath: '/Volumes/Assets/My Library.library',
	isCurrentComputer: true,
});

const WINDOWS = computer({
	id: 'win',
	platform: 'win32',
	username: 'WSeok',
	eagleLibraryPath: 'Z:\\My Library.library',
});

const UNC = computer({
	id: 'unc',
	platform: 'win32',
	eagleLibraryPath: '\\\\NAS\\Assets\\My Library.library',
});

const ORIGINAL = 'images/KXYZ01.info/hero shot.png';

test('normalizePath unifies separators and keeps the UNC prefix', () => {
	assert.equal(normalizePath('Z:\\My Library.library\\'), 'Z:/My Library.library');
	assert.equal(normalizePath('/Volumes/Assets//lib/'), '/Volumes/Assets/lib');
	assert.equal(normalizePath('\\\\NAS\\Assets\\lib'), '//NAS/Assets/lib');
	assert.equal(normalizePath('/'), '/');
});

test('isAbsolutePath accepts all three shapes and rejects relative ones', () => {
	assert.equal(isAbsolutePath('/Volumes/Assets'), true);
	assert.equal(isAbsolutePath('Z:\\lib'), true);
	assert.equal(isAbsolutePath('\\\\NAS\\Assets'), true);
	assert.equal(isAbsolutePath('Dropbox/Work'), false);
	assert.equal(isAbsolutePath(''), false);
});

test('a mac path remaps onto a Windows drive root', () => {
	assert.equal(
		remapPathToComputer(`/Volumes/Assets/My Library.library/${ORIGINAL}`, [MAC, WINDOWS], WINDOWS),
		`Z:/My Library.library/${ORIGINAL}`
	);
});

test('a Windows drive path remaps onto a mac volume root', () => {
	assert.equal(
		remapPathToComputer(`Z:\\My Library.library\\${ORIGINAL.replace(/\//g, '\\')}`, [MAC, WINDOWS], MAC),
		`/Volumes/Assets/My Library.library/${ORIGINAL}`
	);
});

test('a mac path remaps onto a UNC root', () => {
	assert.equal(
		remapPathToComputer(`/Volumes/Assets/My Library.library/${ORIGINAL}`, [MAC, UNC], UNC),
		`//NAS/Assets/My Library.library/${ORIGINAL}`
	);
});

test('a path already on this computer is left alone', () => {
	assert.equal(
		remapPathToComputer(`/Volumes/Assets/My Library.library/${ORIGINAL}`, [MAC, WINDOWS], MAC),
		null
	);
});

test('a path under no registered root is left alone', () => {
	assert.equal(
		remapPathToComputer('/Users/someone/Pictures/loose.png', [MAC, WINDOWS], WINDOWS),
		null
	);
});

test('roots only match on segment boundaries', () => {
	const sibling = computer({ id: 'sibling', eagleLibraryPath: '/Volumes/Assets2/My Library.library' });
	assert.equal(matchLibraryRoot('/Volumes/Assets2/other.png', [MAC]), null);
	assert.equal(matchLibraryRoot('/Volumes/Assets2/other.png', [MAC, sibling]), null);
});

test('the longest matching root wins when roots nest', () => {
	const outer = computer({ id: 'outer', eagleLibraryPath: '/Volumes/Assets' });
	const match = matchLibraryRoot('/Volumes/Assets/My Library.library/photo.png', [outer, MAC]);
	assert.equal(match?.computer.id, 'mac');
	assert.equal(match?.relative, 'photo.png');
});

test('Windows roots compare case-insensitively, mac roots do not', () => {
	assert.equal(matchLibraryRoot('z:/MY LIBRARY.library/a.png', [WINDOWS])?.computer.id, 'win');
	assert.equal(matchLibraryRoot('/volumes/assets/my library.library/a.png', [MAC]), null);
});

test('legacy profiles without a root fall back to the old home-relative form', () => {
	const legacy = computer({
		id: 'legacy',
		platform: 'darwin',
		username: 'kim',
		subPath: 'Dropbox/Work',
	});
	assert.equal(profileLibraryRoot(legacy), '/Users/kim/Dropbox/Work');

	const legacyWindows = computer({ id: 'legacy-win', platform: 'win32', username: 'kim', subPath: '' });
	assert.equal(profileLibraryRoot(legacyWindows), 'C:/Users/kim');
});

test('a profile with neither a root nor a username is unusable', () => {
	assert.equal(profileLibraryRoot(computer({ id: 'empty' })), null);
});

test('file URLs round trip through all three shapes', () => {
	const cases: [string, string][] = [
		['/Volumes/Assets/My Library.library/a.png', 'file:///Volumes/Assets/My%20Library.library/a.png'],
		['Z:/My Library.library/a.png', 'file:///Z:/My%20Library.library/a.png'],
		['//NAS/Assets/My Library.library/a.png', 'file://NAS/Assets/My%20Library.library/a.png'],
	];

	for (const [path, url] of cases) {
		assert.equal(pathToFileUrl(path), url);
		assert.equal(fileUrlToPath(url), path);
	}
});

test('rendered paths use the Obsidian desktop resource scheme', () => {
	const prefix = 'app://runtime-id/';

	assert.equal(
		pathToResourceUrl('/Volumes/Assets/My Library.library/a.png', prefix),
		'app://runtime-id/Volumes/Assets/My%20Library.library/a.png'
	);
	assert.equal(
		pathToResourceUrl('Z:/My Library.library/a.png', prefix),
		'app://runtime-id/Z:/My%20Library.library/a.png'
	);
	assert.equal(
		pathToResourceUrl('//NAS/Assets/My Library.library/a.png', prefix),
		'app://runtime-id///NAS/Assets/My%20Library.library/a.png'
	);
	assert.equal(
		pathToResourceUrl('/Volumes/Assets/My Library.library/a.png', 'file:///'),
		'file:///Volumes/Assets/My%20Library.library/a.png'
	);
});

test('a filename containing a literal percent escape survives the round trip', () => {
	// Decoding until no `%` remained turned this filename into "hero shot.png".
	const path = '/Volumes/Assets/lib/hero%20shot.png';
	assert.equal(pathToFileUrl(path), 'file:///Volumes/Assets/lib/hero%2520shot.png');
	assert.equal(fileUrlToPath(pathToFileUrl(path)), path);
});

test('Korean, spaces and parentheses survive the round trip', () => {
	const path = '/Volumes/Assets/lib/작업 (최종).png';
	assert.equal(fileUrlToPath(pathToFileUrl(path)), path);
});

test('image sources yield a plain path, without the cache buster', () => {
	assert.equal(
		extractPathFromImageSrc('app://a1b2c3/Volumes/Assets/lib/a%20b.png?1737612345678'),
		'/Volumes/Assets/lib/a b.png'
	);
	assert.equal(
		extractPathFromImageSrc('app://a1b2c3/Z:/lib/a.png?1737612345678'),
		'Z:/lib/a.png'
	);
	assert.equal(
		extractPathFromImageSrc('file:///Volumes/Assets/lib/a.png'),
		'/Volumes/Assets/lib/a.png'
	);
	assert.equal(extractPathFromImageSrc('https://example.com/a.png'), null);
});

test('the current computer comes from runtime identity, not from the vault path', () => {
	assert.equal(findCurrentComputer([MAC, WINDOWS], 'darwin', 'alice')?.id, 'mac');

	// Old profiles still fall back to an unambiguous platform match.
	const a = computer({ id: 'a', platform: 'win32' });
	const b = computer({ id: 'b', platform: 'win32' });
	assert.equal(findCurrentComputer([a, b], 'win32'), null);
	assert.equal(findCurrentComputer([a], 'win32')?.id, 'a');
});

test('a synced flag from Windows cannot make Windows current on a Mac', () => {
	const syncedMac = { ...MAC, isCurrentComputer: false };
	const syncedWindows = { ...WINDOWS, isCurrentComputer: true };

	assert.equal(
		findCurrentComputer([syncedMac, syncedWindows], 'darwin', 'alice')?.id,
		'mac'
	);
	assert.equal(
		findCurrentComputer([syncedMac, syncedWindows], 'win32', 'WSeok')?.id,
		'win'
	);
});
