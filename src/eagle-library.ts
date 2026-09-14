// Pure helpers for Eagle's library and folder model. No I/O, no Obsidian and no
// Node imports, so this module runs under `node --test` with type stripping.
//
// Two facts drive the design:
//
//   1. Eagle opens exactly one library at a time. Targeting another library means
//      switching to it, so a library is identified by its path, not by a handle.
//   2. Folder ids are scoped to their library. The same id means nothing in a
//      different library, and a deleted folder takes its id with it. That is why
//      a profile stores both the id and the display path — see resolveDefaultFolder.

import type { EagleFolder, EagleLibraryProfile, FlatEagleFolder } from './types';

/**
 * Eagle reports the same library both with and without a trailing separator —
 * its own history list has been observed to contain both forms for one library.
 * Every comparison and every stored path goes through here so one library never
 * becomes two profiles.
 */
export function normalizeLibraryPath(path: string): string {
	return path.replace(/[/\\]+$/, '');
}

/**
 * `/Users/x/CMDS Design Library.library` -> `CMDS Design Library`.
 * Falls back to the basename when the path does not carry the `.library` suffix,
 * so a hand-typed path still produces something showable.
 */
export function libraryNameFromPath(path: string): string {
	if (!path) return '';
	const trimmed = path.replace(/[/\\]+$/, '');
	const basename = trimmed.split(/[/\\]/).pop() ?? '';
	return basename.replace(/\.library$/i, '');
}

/**
 * Depth-first flatten of Eagle's nested folder tree into display paths
 * (`Projects/Jazz Blend`), preserving sibling order.
 *
 * Eagle has been observed to serialise its folder tree with Angular artefacts
 * attached, so a malformed or self-referential `children` array is not purely
 * hypothetical: ids already seen are skipped rather than recursed into.
 */
export function flattenFolders(folders: EagleFolder[]): FlatEagleFolder[] {
	const out: FlatEagleFolder[] = [];
	const seen = new Set<string>();

	const walk = (nodes: EagleFolder[], prefix: string, depth: number): void => {
		for (const node of nodes ?? []) {
			if (!node || typeof node.id !== 'string') continue;
			if (seen.has(node.id)) continue;
			seen.add(node.id);

			const path = prefix ? `${prefix}/${node.name}` : node.name;
			out.push({
				id: node.id,
				name: node.name,
				path,
				depth,
				imageCount: node.imageCount ?? 0,
			});

			if (Array.isArray(node.children) && node.children.length > 0) {
				walk(node.children, path, depth + 1);
			}
		}
	};

	walk(folders ?? [], '', 0);
	return out;
}

export function findFolderByPath(flat: FlatEagleFolder[], path: string): FlatEagleFolder | null {
	if (!path) return null;
	return flat.find(folder => folder.path === path) ?? null;
}

export function findFolderById(flat: FlatEagleFolder[], id: string): FlatEagleFolder | null {
	if (!id) return null;
	return flat.find(folder => folder.id === id) ?? null;
}

export interface ResolvedFolder {
	id: string;
	path: string;
	/** The stored id was stale and the folder was recovered by its display path. */
	repaired: boolean;
}

/**
 * Resolve a profile's remembered default folder against the library as it is now.
 *
 * The id is authoritative, but folders get deleted and re-created — which yields
 * the same display path under a new id. Falling back to the path turns a silent
 * "imports went to the root again" into a recoverable repair the caller can
 * persist and report.
 */
export function resolveDefaultFolder(
	flat: FlatEagleFolder[],
	profile: EagleLibraryProfile
): ResolvedFolder | null {
	const byId = findFolderById(flat, profile.defaultFolderId);
	if (byId) {
		return { id: byId.id, path: byId.path, repaired: false };
	}

	const byPath = findFolderByPath(flat, profile.defaultFolderPath);
	if (byPath) {
		return { id: byPath.id, path: byPath.path, repaired: true };
	}

	return null;
}

export function libraryProfileFor(
	libraries: EagleLibraryProfile[],
	path: string
): EagleLibraryProfile | null {
	if (!path) return null;
	const target = normalizeLibraryPath(path);
	return libraries.find(library => normalizeLibraryPath(library.path) === target) ?? null;
}

/** Returns a new array — callers hold plugin settings, which must not be mutated in place. */
export function upsertLibraryProfile(
	libraries: EagleLibraryProfile[],
	profile: EagleLibraryProfile
): EagleLibraryProfile[] {
	const normalized = { ...profile, path: normalizeLibraryPath(profile.path) };
	const index = libraries.findIndex(
		library => normalizeLibraryPath(library.path) === normalized.path
	);
	if (index === -1) {
		return [...libraries, normalized];
	}
	const next = [...libraries];
	next[index] = { ...next[index], ...normalized };
	return next;
}

/** Remove a profile by path. Returns a new array; unknown paths are a no-op. */
export function removeLibraryProfile(
	libraries: EagleLibraryProfile[],
	path: string
): EagleLibraryProfile[] {
	const target = normalizeLibraryPath(path);
	return libraries.filter(library => normalizeLibraryPath(library.path) !== target);
}

/**
 * `unverified` is not a soft `missing` — it means we had no basis to judge
 * (Eagle was closed, so its history could not be read) and the caller must
 * neither flag nor prune the profile.
 */
export type LibraryPresence = 'present' | 'missing' | 'unverified';

export interface LibraryFacts {
	/** Eagle still lists the path in `/api/library/history`. `null` = history unavailable. */
	inEagleHistory: boolean | null;
	/** The `.library` bundle resolves on disk right now. */
	existsOnDisk: boolean;
}

/**
 * Decide whether a stored profile still refers to a real library.
 *
 * ── The trade-off this encodes ───────────────────────────────────────────────
 * A profile carries the user's default-folder choice, so calling a library
 * `missing` too eagerly risks discarding configuration for a library that is
 * merely offline. Two situations look identical from here:
 *
 *   • renamed or deleted  → gone for good, should be removable
 *   • external / network volume unmounted → will come back, must be kept
 *
 * Current policy is the strict one: BOTH signals must agree. Eagle drops a
 * library from its history when the bundle is renamed or deleted, but keeps
 * remembering one whose drive is simply detached — so requiring
 * `!inEagleHistory && !existsOnDisk` treats an unmounted volume as present.
 *
 * Loosen it to `!existsOnDisk` alone if you never keep libraries on removable
 * or network volumes: detection becomes immediate, at the cost of flagging an
 * unmounted library as missing.
 */
export function classifyLibraryPresence(facts: LibraryFacts): LibraryPresence {
	if (facts.inEagleHistory === null) return 'unverified';
	if (!facts.inEagleHistory && !facts.existsOnDisk) return 'missing';
	return 'present';
}

/**
 * Paths of every stored profile that `classifyLibraryPresence` calls missing.
 * `existsOnDisk` is injected so this stays pure and testable without fs.
 */
export function missingLibraryPaths(
	libraries: EagleLibraryProfile[],
	eagleHistory: string[] | null,
	existsOnDisk: (path: string) => boolean
): string[] {
	const known = eagleHistory === null ? null : new Set(eagleHistory.map(normalizeLibraryPath));
	return libraries
		.filter(library => classifyLibraryPresence({
			inEagleHistory: known === null ? null : known.has(normalizeLibraryPath(library.path)),
			existsOnDisk: existsOnDisk(library.path),
		}) === 'missing')
		.map(library => normalizeLibraryPath(library.path));
}

/** An Eagle item referenced by a note, with whatever location the note revealed. */
export interface EagleReference {
	id: string;
	/** Library the note points into — only `cmds-eagle*` modes embed an absolute path. */
	libraryPath?: string;
	/** Absolute path of the embedded original, decoded. */
	filePath?: string;
}

const FILE_EMBED = /file:\/\/(\/[^)\s"']*?\.library)\/images\/([A-Za-z0-9]+)\.info\/([^)\s"']+)/g;
const DEEPLINK = /eagle:\/\/item\/([A-Za-z0-9]+)/g;

function decodePercent(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/**
 * Every Eagle item a note refers to, merged by id.
 *
 * Notes carry two different kinds of reference and they fail in different ways:
 * an `eagle://` deep link breaks when the ITEM is gone, while a `file://` embed
 * breaks when the FILE is gone — and a file can vanish while Eagle still lists
 * the item, or the reverse. The absolute path also tells us which library the
 * item lives in, which is the only way to check an item without guessing.
 */
export function parseEagleReferences(content: string): EagleReference[] {
	const byId = new Map<string, EagleReference>();

	for (const match of content.matchAll(FILE_EMBED)) {
		const libraryPath = decodePercent(match[1]);
		const id = match[2];
		byId.set(id, {
			id,
			libraryPath,
			filePath: `${libraryPath}/images/${id}.info/${decodePercent(match[3])}`,
		});
	}

	for (const match of content.matchAll(DEEPLINK)) {
		const id = match[1];
		if (!byId.has(id)) byId.set(id, { id });
	}

	return [...byId.values()];
}

/** Group references by the library they are known to live in; `''` keys the unknown ones. */
export function groupReferencesByLibrary(refs: EagleReference[]): Map<string, EagleReference[]> {
	const grouped = new Map<string, EagleReference[]>();
	for (const ref of refs) {
		const key = ref.libraryPath ? normalizeLibraryPath(ref.libraryPath) : '';
		const bucket = grouped.get(key);
		if (bucket) bucket.push(ref);
		else grouped.set(key, [ref]);
	}
	return grouped;
}
