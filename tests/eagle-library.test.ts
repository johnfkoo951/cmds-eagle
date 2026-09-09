import test from 'node:test';
import assert from 'node:assert/strict';

import {
	libraryNameFromPath,
	normalizeLibraryPath,
	flattenFolders,
	findFolderByPath,
	findFolderById,
	resolveDefaultFolder,
	libraryProfileFor,
	upsertLibraryProfile,
} from '../src/eagle-library.ts';
import type { EagleFolder, EagleLibraryProfile } from '../src/types.ts';

function folder(id: string, name: string, children: EagleFolder[] = [], imageCount = 0): EagleFolder {
	return {
		id,
		name,
		description: '',
		children,
		modificationTime: 0,
		tags: [],
		imageCount,
		descendantImageCount: imageCount,
	};
}

// Shaped after the real tree returned by a live Eagle 4.0.0.
const TREE: EagleFolder[] = [
	folder('ML4XUV682EBDI', 'CMDS Yohan Koo', [
		folder('MMMTST64WF8BD', 'Publish', [], 12),
		folder('ML4Y3NZQWXK7J', 'Mobile Operations Center', [], 3),
	]),
	folder('MCWXNRUG44A35', 'Projects(in progress)', [
		folder('MD4H5PUEUTPCN', 'Jazz Blend', [], 27),
	]),
];

test('libraryNameFromPath strips the .library suffix', () => {
	assert.equal(
		libraryNameFromPath('/Users/yohankoo/CMDS Sync/70. CMDS Shared Library/CMDS Design Library.library'),
		'CMDS Design Library'
	);
});

test('libraryNameFromPath tolerates trailing slashes, Windows paths and missing suffix', () => {
	assert.equal(libraryNameFromPath('/Users/x/Photo.library/'), 'Photo');
	assert.equal(libraryNameFromPath('Z:\\Assets\\Shared.library'), 'Shared');
	assert.equal(libraryNameFromPath('\\\\NAS\\share\\Team.library\\'), 'Team');
	assert.equal(libraryNameFromPath('/Users/x/NotALibrary'), 'NotALibrary');
	assert.equal(libraryNameFromPath(''), '');
});

test('flattenFolders produces display paths depth-first in sibling order', () => {
	assert.deepEqual(
		flattenFolders(TREE).map(f => `${f.depth}:${f.path}`),
		[
			'0:CMDS Yohan Koo',
			'1:CMDS Yohan Koo/Publish',
			'1:CMDS Yohan Koo/Mobile Operations Center',
			'0:Projects(in progress)',
			'1:Projects(in progress)/Jazz Blend',
		]
	);
});

test('flattenFolders carries id and image count, defaulting a missing count to 0', () => {
	const flat = flattenFolders(TREE);
	const jazz = flat.find(f => f.name === 'Jazz Blend');
	assert.equal(jazz?.id, 'MD4H5PUEUTPCN');
	assert.equal(jazz?.imageCount, 27);

	const countless = { ...folder('X1', 'Countless') } as Partial<EagleFolder>;
	delete countless.imageCount;
	assert.equal(flattenFolders([countless as EagleFolder])[0].imageCount, 0);
});

test('flattenFolders survives a self-referential tree instead of hanging', () => {
	const loop = folder('LOOP', 'Loop');
	loop.children = [loop];
	const flat = flattenFolders([loop]);
	assert.deepEqual(flat.map(f => f.path), ['Loop']);
});

test('flattenFolders skips a folder repeated elsewhere in the tree', () => {
	const shared = folder('DUP', 'Shared');
	const flat = flattenFolders([folder('A', 'A', [shared]), folder('B', 'B', [shared])]);
	assert.deepEqual(flat.map(f => f.path), ['A', 'A/Shared', 'B']);
});

test('flattenFolders handles an empty or absent tree', () => {
	assert.deepEqual(flattenFolders([]), []);
	assert.deepEqual(flattenFolders(undefined as unknown as EagleFolder[]), []);
});

test('folder lookup by path is exact and case-sensitive', () => {
	const flat = flattenFolders(TREE);
	assert.equal(findFolderByPath(flat, 'CMDS Yohan Koo/Publish')?.id, 'MMMTST64WF8BD');
	assert.equal(findFolderByPath(flat, 'cmds yohan koo/publish'), null);
	assert.equal(findFolderByPath(flat, 'Publish'), null, 'a leaf name must not match a nested path');
	assert.equal(findFolderByPath(flat, ''), null);
});

test('folder lookup by id', () => {
	const flat = flattenFolders(TREE);
	assert.equal(findFolderById(flat, 'MD4H5PUEUTPCN')?.path, 'Projects(in progress)/Jazz Blend');
	assert.equal(findFolderById(flat, 'GONE'), null);
	assert.equal(findFolderById(flat, ''), null);
});

const PROFILE: EagleLibraryProfile = {
	path: '/Users/x/Design.library',
	name: 'Design',
	defaultFolderId: 'MMMTST64WF8BD',
	defaultFolderPath: 'CMDS Yohan Koo/Publish',
};

test('resolveDefaultFolder prefers the stored id', () => {
	assert.deepEqual(resolveDefaultFolder(flattenFolders(TREE), PROFILE), {
		id: 'MMMTST64WF8BD',
		path: 'CMDS Yohan Koo/Publish',
		repaired: false,
	});
});

test('resolveDefaultFolder recovers a re-created folder by path and flags the repair', () => {
	const recreated: EagleFolder[] = [
		folder('CMDS', 'CMDS Yohan Koo', [folder('NEWID12345678', 'Publish', [], 4)]),
	];
	assert.deepEqual(resolveDefaultFolder(flattenFolders(recreated), PROFILE), {
		id: 'NEWID12345678',
		path: 'CMDS Yohan Koo/Publish',
		repaired: true,
	});
});

test('resolveDefaultFolder returns null when neither id nor path survives', () => {
	assert.equal(resolveDefaultFolder(flattenFolders([folder('Z', 'Zebra')]), PROFILE), null);
});

test('resolveDefaultFolder returns null for a profile with no default set', () => {
	const blank: EagleLibraryProfile = { ...PROFILE, defaultFolderId: '', defaultFolderPath: '' };
	assert.equal(resolveDefaultFolder(flattenFolders(TREE), blank), null);
});

test('libraryProfileFor matches on path', () => {
	assert.equal(libraryProfileFor([PROFILE], '/Users/x/Design.library')?.name, 'Design');
	assert.equal(libraryProfileFor([PROFILE], '/Users/x/Other.library'), null);
	assert.equal(libraryProfileFor([PROFILE], ''), null);
	assert.equal(libraryProfileFor([], '/Users/x/Design.library'), null);
});

test('upsertLibraryProfile appends a new library without mutating the input', () => {
	const input = [PROFILE];
	const added: EagleLibraryProfile = {
		path: '/Users/x/Photo.library',
		name: 'Photo',
		defaultFolderId: '',
		defaultFolderPath: '',
	};

	const next = upsertLibraryProfile(input, added);
	assert.equal(next.length, 2);
	assert.equal(input.length, 1, 'settings arrays must not be mutated in place');
	assert.notEqual(next, input);
});

test('upsertLibraryProfile updates in place, preserving position', () => {
	const first: EagleLibraryProfile = { ...PROFILE, path: '/a.library', name: 'A' };
	const second: EagleLibraryProfile = { ...PROFILE, path: '/b.library', name: 'B' };

	const next = upsertLibraryProfile([first, second], {
		...second,
		defaultFolderId: 'CHANGED',
		defaultFolderPath: 'Inbox',
	});

	assert.equal(next.length, 2);
	assert.equal(next[0].path, '/a.library');
	assert.equal(next[1].defaultFolderId, 'CHANGED');
	assert.equal(next[1].defaultFolderPath, 'Inbox');
	assert.equal(second.defaultFolderId, PROFILE.defaultFolderId, 'the original entry must be untouched');
});

test('normalizeLibraryPath folds the trailing-separator forms Eagle reports', () => {
	// Eagle's own /api/library/history returns both spellings for one library.
	assert.equal(
		normalizeLibraryPath('/Users/yohankoo/YHN/Yohan Koo Library.library/'),
		normalizeLibraryPath('/Users/yohankoo/YHN/Yohan Koo Library.library')
	);
	assert.equal(normalizeLibraryPath('Z:\\Assets\\Shared.library\\'), 'Z:\\Assets\\Shared.library');
	assert.equal(normalizeLibraryPath(''), '');
});

test('a library is never split in two by a trailing slash', () => {
	const slashed: EagleLibraryProfile = {
		path: '/Users/x/Photo.library/',
		name: 'Photo',
		defaultFolderId: 'F1',
		defaultFolderPath: 'Inbox',
	};

	const merged = upsertLibraryProfile([slashed], { ...slashed, path: '/Users/x/Photo.library' });
	assert.equal(merged.length, 1, 'the two spellings must collapse into one profile');
	assert.equal(merged[0].path, '/Users/x/Photo.library', 'the stored path is normalised');

	assert.equal(libraryProfileFor(merged, '/Users/x/Photo.library/')?.defaultFolderId, 'F1');
	assert.equal(libraryProfileFor([slashed], '/Users/x/Photo.library')?.name, 'Photo');
});
