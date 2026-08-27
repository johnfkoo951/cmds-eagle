import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pollEagleItemInfo, pollEagleOriginalPath } from '../src/eagle-item-poll.ts';

test('retries when Eagle returns an id before item info is visible', async () => {
	let now = 0;
	let attempts = 0;
	const waits: number[] = [];
	const expected = { id: 'MT6TVCRRZJQZ7' };

	const item = await pollEagleItemInfo('MT6TVCRRZJQZ7', {
		timeoutMs: 5000,
		getItemInfo: async () => {
			attempts++;
			return attempts === 3 ? expected : null;
		},
		now: () => now,
		sleep: async (ms) => {
			waits.push(ms);
			now += ms;
		},
	});

	assert.equal(item, expected);
	assert.equal(attempts, 3);
	assert.deepEqual(waits, [100, 200]);
});

test('returns immediately when item info is already visible', async () => {
	let slept = false;
	const expected = { id: 'ready' };

	const item = await pollEagleItemInfo('ready', {
		timeoutMs: 5000,
		getItemInfo: async () => expected,
		sleep: async () => {
			slept = true;
		},
	});

	assert.equal(item, expected);
	assert.equal(slept, false);
});

test('stops at the timeout when Eagle never exposes item info', async () => {
	let now = 0;
	let attempts = 0;
	const waits: number[] = [];

	const item = await pollEagleItemInfo('missing', {
		timeoutMs: 250,
		getItemInfo: async () => {
			attempts++;
			return null;
		},
		now: () => now,
		sleep: async (ms) => {
			waits.push(ms);
			now += ms;
		},
	});

	assert.equal(item, null);
	assert.equal(attempts, 3);
	assert.deepEqual(waits, [100, 150]);
});

test('waits for Eagle to finish copying the original file', async () => {
	let now = 0;
	let checks = 0;
	const waits: number[] = [];
	const expectedPath = '/Volumes/Assets/library/images/ITEM.info/image.png';

	const path = await pollEagleOriginalPath({
		timeoutMs: 5000,
		getOriginalFilePath: async () => expectedPath,
		isReady: async () => {
			checks++;
			return checks === 3;
		},
		now: () => now,
		sleep: async (ms) => {
			waits.push(ms);
			now += ms;
		},
	});

	assert.equal(path, expectedPath);
	assert.equal(checks, 3);
	assert.deepEqual(waits, [100, 200]);
});

test('does not accept an original path whose file is still missing', async () => {
	let now = 0;
	let checks = 0;

	const path = await pollEagleOriginalPath({
		timeoutMs: 100,
		getOriginalFilePath: async () => '/library/images/ITEM.info/image.png',
		isReady: async () => {
			checks++;
			return false;
		},
		now: () => now,
		sleep: async (ms) => {
			now += ms;
		},
	});

	assert.equal(path, null);
	assert.equal(checks, 2);
});
