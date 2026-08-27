const INITIAL_DELAY_MS = 100;
const BACKOFF_FACTOR = 2;
const MAX_DELAY_MS = 1000;

export interface EagleItemPollOptions<T> {
	timeoutMs: number;
	getItemInfo: (itemId: string) => Promise<T | null>;
	/** Injectable clock for deterministic tests. */
	now?: () => number;
	/** Injectable sleeper for deterministic tests. */
	sleep?: (ms: number) => Promise<void>;
}

export interface EagleOriginalPathPollOptions {
	timeoutMs: number;
	getOriginalFilePath: () => Promise<string | null>;
	isReady: (absolutePath: string) => Promise<boolean>;
	/** Injectable clock for deterministic tests. */
	now?: () => number;
	/** Injectable sleeper for deterministic tests. */
	sleep?: (ms: number) => Promise<void>;
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => window.setTimeout(resolve, ms));
}

/**
 * Eagle can return an item id before `/api/item/info` exposes that item. Poll
 * the local API with bounded exponential backoff so a successful import is not
 * reported as a failure merely because the follow-up request won the race.
 */
async function pollWithBackoff<T>(options: {
	timeoutMs: number;
	read: () => Promise<T | null>;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
}): Promise<T | null> {
	const now = options.now ?? Date.now;
	const wait = options.sleep ?? sleep;
	const deadline = now() + Math.max(0, options.timeoutMs);
	let delayMs = INITIAL_DELAY_MS;

	for (;;) {
		const value = await options.read();
		if (value) return value;

		const remainingMs = deadline - now();
		if (remainingMs <= 0) return null;

		await wait(Math.min(delayMs, remainingMs));
		delayMs = Math.min(delayMs * BACKOFF_FACTOR, MAX_DELAY_MS);
	}
}

export function pollEagleItemInfo<T>(
	itemId: string,
	options: EagleItemPollOptions<T>
): Promise<T | null> {
	return pollWithBackoff({
		timeoutMs: options.timeoutMs,
		read: () => options.getItemInfo(itemId),
		now: options.now,
		sleep: options.sleep,
	});
}

/** Waits until Eagle reports a path whose copied file is actually ready. */
export function pollEagleOriginalPath(
	options: EagleOriginalPathPollOptions
): Promise<string | null> {
	return pollWithBackoff({
		timeoutMs: options.timeoutMs,
		read: async () => {
			const path = await options.getOriginalFilePath();
			return path && await options.isReady(path) ? path : null;
		},
		now: options.now,
		sleep: options.sleep,
	});
}
