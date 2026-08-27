interface RenderedImageMutation {
	type: string;
	target: unknown;
	attributeName: string | null;
	addedNodes: ArrayLike<unknown>;
}

interface ElementLike {
	nodeType: number;
	tagName: string;
	querySelectorAll(selector: string): ArrayLike<unknown>;
}

function asElement(node: unknown): ElementLike | null {
	if (!node || typeof node !== 'object') return null;
	const candidate = node as Partial<ElementLike>;
	if (candidate.nodeType !== 1) return null;
	if (typeof candidate.tagName !== 'string') return null;
	if (typeof candidate.querySelectorAll !== 'function') return null;
	return candidate as ElementLike;
}

/** Processes images that Live Preview adds later or reuses with a new `src`. */
export function processRenderedImageMutations(
	mutations: ReadonlyArray<RenderedImageMutation>,
	processImage: (image: HTMLImageElement) => void
): number {
	const images = new Set<HTMLImageElement>();

	const collect = (node: unknown): void => {
		const element = asElement(node);
		if (!element) return;

		if (element.tagName.toUpperCase() === 'IMG') {
			images.add(element as unknown as HTMLImageElement);
			return;
		}

		const descendants = element.querySelectorAll('img');
		for (let index = 0; index < descendants.length; index++) {
			const image = asElement(descendants[index]);
			if (image?.tagName.toUpperCase() === 'IMG') {
				images.add(image as unknown as HTMLImageElement);
			}
		}
	};

	for (const mutation of mutations) {
		if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
			collect(mutation.target);
			continue;
		}

		if (mutation.type !== 'childList') continue;
		for (let index = 0; index < mutation.addedNodes.length; index++) {
			collect(mutation.addedNodes[index]);
		}
	}

	for (const image of images) {
		processImage(image);
	}
	return images.size;
}
