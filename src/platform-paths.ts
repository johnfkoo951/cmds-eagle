// Machine-specific absolute roots, so a `file://` reference into a shared Eagle
// library survives the trip between desktops. Each computer registers the
// absolute path where the library is mounted — `/Volumes/…` on macOS, `Z:\…` or
// `\\NAS\share\…` on Windows — and remapping a path is a root swap.
//
// Nothing here assumes the library lives under a home directory. The previous
// `/Users/<name>/<subPath>` form only worked when a cloud service replicated the
// same relative structure inside every machine's home folder, which is the
// opposite topology from a NAS: one shared volume, a different mount point per
// machine.
//
// Paths are held in a single internal form — forward slashes, no trailing
// separator, UNC keeping its leading `//host`.

import type { ComputerProfile, PlatformType } from './types';

const FILE_SCHEME = 'file://';
const UNC_PREFIX = '//';

/** Forward slashes, collapsed separators, no trailing separator. UNC keeps `//host`. */
export function normalizePath(path: string): string {
	const slashed = path.replace(/\\/g, '/');
	const isUnc = slashed.startsWith(UNC_PREFIX);
	const collapsed = slashed.replace(/\/{2,}/g, '/');
	const restored = isUnc ? `/${collapsed}` : collapsed;
	return restored.length > 1 ? restored.replace(/\/+$/, '') : restored;
}

/** Windows compares case-insensitively; macOS is left as typed. */
function comparable(path: string, platform: PlatformType): string {
	return platform === 'win32' ? path.toLowerCase() : path;
}

export function isAbsolutePath(path: string): boolean {
	const normalized = normalizePath(path.trim());
	return normalized.startsWith('/') || /^[A-Za-z]:(\/|$)/.test(normalized);
}

/**
 * The absolute root this computer mounts the Eagle library at. Profiles saved
 * before roots existed only recorded the folders between the home directory and
 * the library, so rebuild the old root from `subPath` when no explicit one is set.
 */
export function profileLibraryRoot(computer: ComputerProfile): string | null {
	const explicit = computer.eagleLibraryPath?.trim();
	if (explicit) {
		return normalizePath(explicit);
	}

	if (!computer.username) {
		return null;
	}
	const home = computer.platform === 'darwin'
		? `/Users/${computer.username}`
		: `C:/Users/${computer.username}`;
	const sub = computer.subPath?.trim().replace(/^[/\\]+|[/\\]+$/g, '');
	return normalizePath(sub ? `${home}/${sub}` : home);
}

export interface RootMatch {
	computer: ComputerProfile;
	root: string;
	/** Path below the root, without a leading separator. Empty when the path *is* the root. */
	relative: string;
}

/**
 * The registered computer whose root contains this path. Longest root wins, so
 * nested registrations resolve to the most specific one.
 */
export function matchLibraryRoot(path: string, computers: ComputerProfile[]): RootMatch | null {
	const normalized = normalizePath(path);
	let best: RootMatch | null = null;

	for (const computer of computers) {
		const root = profileLibraryRoot(computer);
		if (!root) continue;

		const relative = relativeToRoot(normalized, root, computer.platform);
		if (relative === null) continue;

		if (!best || root.length > best.root.length) {
			best = { computer, root, relative };
		}
	}
	return best;
}

/** Prefix test on segment boundaries, so `/Volumes/Assets` never swallows `/Volumes/Assets2`. */
function relativeToRoot(path: string, root: string, platform: PlatformType): string | null {
	const candidate = comparable(path, platform);
	const prefix = comparable(root, platform);

	if (candidate === prefix) return '';
	if (candidate.startsWith(`${prefix}/`)) return path.slice(root.length + 1);
	return null;
}

export function joinRoot(root: string, relative: string): string {
	const base = normalizePath(root);
	return relative ? `${base}/${normalizePath(relative)}` : base;
}

/**
 * The computer running the plugin. Runtime platform + username wins because
 * settings sync across the vault: a shared `isCurrentComputer` flag selected on
 * Windows must never make that Windows profile current on a Mac. The flag is
 * only a fallback for duplicate profiles with the same runtime identity.
 */
export function findCurrentComputer(
	computers: ComputerProfile[],
	platform: PlatformType,
	username = ''
): ComputerProfile | null {
	if (username) {
		const sameIdentity = computers.filter(
			computer => computer.platform === platform && computer.username === username
		);
		const flaggedIdentity = sameIdentity.find(computer => computer.isCurrentComputer);
		if (flaggedIdentity) return flaggedIdentity;
		if (sameIdentity.length === 1) return sameIdentity[0];
		if (sameIdentity.length > 1) return null;
	}

	const samePlatform = computers.filter(computer => computer.platform === platform);
	const flaggedPlatform = samePlatform.find(computer => computer.isCurrentComputer);
	if (flaggedPlatform) return flaggedPlatform;
	return samePlatform.length === 1 ? samePlatform[0] : null;
}

export function safeDecodeUri(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/**
 * Decodes each segment exactly once. Decoding repeatedly — as the previous
 * implementation did until no `%` remained — turns a filename containing a
 * literal `%20` into one containing a space.
 */
function decodeSegments(path: string): string {
	return path.split('/').map(safeDecodeUri).join('/');
}

function encodeSegments(segments: string[]): string {
	return segments.map(segment => encodeURIComponent(segment)).join('/');
}

/**
 * Serialises a plain filesystem path. The three shapes need different authority
 * handling: a UNC server name *is* the URL authority, a drive letter must keep
 * its colon, and a POSIX path has an empty authority.
 */
export function pathToFileUrl(path: string): string {
	const normalized = normalizePath(path);

	if (normalized.startsWith(UNC_PREFIX)) {
		const [, , host, ...rest] = normalized.split('/');
		const encodedHost = encodeURIComponent(host);
		return rest.length
			? `${FILE_SCHEME}${encodedHost}/${encodeSegments(rest)}`
			: `${FILE_SCHEME}${encodedHost}`;
	}

	if (/^[A-Za-z]:/.test(normalized)) {
		const [drive, ...rest] = normalized.split('/');
		return rest.length
			? `${FILE_SCHEME}/${drive}/${encodeSegments(rest)}`
			: `${FILE_SCHEME}/${drive}`;
	}

	return `${FILE_SCHEME}${encodeSegments(normalized.split('/'))}`;
}

/**
 * Serialises an absolute path for an image element rendered by Obsidian.
 * Desktop Obsidian serves local files through a per-runtime `app://` prefix;
 * assigning a raw `file://` URL after rendering bypasses that resource handler.
 */
export function pathToResourceUrl(path: string, resourcePathPrefix: string): string {
	const fileUrl = pathToFileUrl(path);
	if (resourcePathPrefix.startsWith(FILE_SCHEME)) return fileUrl;

	const prefix = resourcePathPrefix.endsWith('/')
		? resourcePathPrefix
		: `${resourcePathPrefix}/`;
	const resourcePath = fileUrl.startsWith('file:///')
		? fileUrl.slice('file:///'.length)
		: `//${fileUrl.slice(FILE_SCHEME.length)}`;
	return `${prefix}${resourcePath}`;
}

/** Inverse of {@link pathToFileUrl}. Keeps the leading separator of POSIX paths. */
export function fileUrlToPath(url: string): string | null {
	if (!url.startsWith(FILE_SCHEME)) return null;

	const rest = url.slice(FILE_SCHEME.length);
	if (!rest) return null;

	if (rest.startsWith('/')) {
		const decoded = decodeSegments(rest);
		return /^\/[A-Za-z]:/.test(decoded) ? decoded.slice(1) : decoded;
	}
	return `${UNC_PREFIX}${decodeSegments(rest)}`;
}

/**
 * The filesystem path behind a rendered `<img src>`. Obsidian serves local files
 * as `app://<hash>/<path>?<cache-buster>`; the query would otherwise be carried
 * into the remapped path.
 */
export function extractPathFromImageSrc(src: string): string | null {
	if (src.startsWith(FILE_SCHEME)) {
		return fileUrlToPath(src);
	}

	const appMatch = src.match(/^app:\/\/[^/]+\/([^?#]+)/);
	if (!appMatch) return null;

	const decoded = decodeSegments(appMatch[1]);
	if (/^[A-Za-z]:/.test(decoded)) return decoded;
	return decoded.startsWith('/') ? decoded : `/${decoded}`;
}

/**
 * Rewrites a path recorded on one registered computer so it resolves on another.
 * Returns null when no registered root contains the path, when it already
 * belongs to this computer, or when this computer has no root of its own.
 */
export function remapPathToComputer(
	path: string,
	computers: ComputerProfile[],
	current: ComputerProfile | null
): string | null {
	if (!current) return null;

	const match = matchLibraryRoot(path, computers);
	if (!match || match.computer.id === current.id) return null;

	const targetRoot = profileLibraryRoot(current);
	if (!targetRoot) return null;

	const remapped = joinRoot(targetRoot, match.relative);
	return remapped === normalizePath(path) ? null : remapped;
}
