import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveAttachmentPath } from '../src/attachment-path.ts';

const FILE = '1737000000-shot.png';

test('an unset attachment folder puts the file at the vault root', () => {
	assert.equal(resolveAttachmentPath('', 'Notes', FILE), FILE);
});

test('"/" means the vault root, not a path prefix (issue #1)', () => {
	// The reported bug: '/' was treated as a prefix, producing '//1737…png',
	// which Obsidian cannot resolve — "image not found".
	const result = resolveAttachmentPath('/', 'Notes', FILE);
	assert.equal(result, FILE);
	assert.ok(!result.startsWith('/'), 'must not start with a slash');
	assert.ok(!result.includes('//'), 'must not contain a doubled separator');
});

test('"./" means the note\'s own folder', () => {
	assert.equal(resolveAttachmentPath('./', 'Notes/Daily', FILE), `Notes/Daily/${FILE}`);
	assert.equal(resolveAttachmentPath('./', '', FILE), FILE, 'a root-level note has no parent folder');
});

test('"./sub" means a subfolder of the note\'s folder', () => {
	assert.equal(resolveAttachmentPath('./assets', 'Notes/Daily', FILE), `Notes/Daily/assets/${FILE}`);
	assert.equal(resolveAttachmentPath('./assets', '', FILE), `assets/${FILE}`);
});

test('a plain folder is used as a fixed vault path', () => {
	assert.equal(resolveAttachmentPath('attachments', 'Notes', FILE), `attachments/${FILE}`);
	assert.equal(resolveAttachmentPath('attachments/img', 'Notes', FILE), `attachments/img/${FILE}`);
});

test('stray slashes and whitespace never produce a doubled separator', () => {
	for (const setting of ['/attachments', 'attachments/', '/attachments/', '  attachments  ', './assets/']) {
		const result = resolveAttachmentPath(setting, 'Notes', FILE);
		assert.ok(!result.includes('//'), `"${setting}" produced ${result}`);
		assert.ok(!result.startsWith('/'), `"${setting}" produced ${result}`);
	}
});
