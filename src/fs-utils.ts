import { promises } from 'fs';

/**
 * Explicitly-typed view over the Node fs surface this plugin uses.
 * Keeps every call site fully typed even in analysis environments that
 * cannot resolve the 'fs' module types (they see `promises` as `any`).
 */
export interface FsPromisesLike {
	readFile(path: string): Promise<Buffer>;
}

export const fsp: FsPromisesLike = promises as FsPromisesLike;
