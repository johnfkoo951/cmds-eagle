import assert from 'node:assert/strict';
import { test } from 'node:test';

import { processRenderedImageMutations } from '../src/rendered-images.ts';

interface FakeElement {
	nodeType: number;
	tagName: string;
	querySelectorAll(selector: string): FakeElement[];
}

function element(tagName: string, descendants: FakeElement[] = []): FakeElement {
	return {
		nodeType: 1,
		tagName,
		querySelectorAll: (selector: string) => selector === 'img' ? descendants : [],
	};
}

test('new live-preview images and descendants are processed once', () => {
	const directImage = element('IMG');
	const nestedImage = element('IMG');
	const wrapper = element('DIV', [directImage, nestedImage]);
	const processed: FakeElement[] = [];

	const count = processRenderedImageMutations(
		[{
			type: 'childList',
			target: wrapper,
			attributeName: null,
			addedNodes: [directImage, wrapper],
		}],
		image => processed.push(image as unknown as FakeElement)
	);

	assert.equal(count, 2);
	assert.deepEqual(processed, [directImage, nestedImage]);
});

test('a reused live-preview image is processed when its src changes', () => {
	const image = element('IMG');
	const processed: FakeElement[] = [];

	const count = processRenderedImageMutations(
		[{
			type: 'attributes',
			target: image,
			attributeName: 'src',
			addedNodes: [],
		}],
		candidate => processed.push(candidate as unknown as FakeElement)
	);

	assert.equal(count, 1);
	assert.deepEqual(processed, [image]);
});
