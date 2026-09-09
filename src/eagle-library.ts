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
