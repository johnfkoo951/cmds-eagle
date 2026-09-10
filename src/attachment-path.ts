// Where a locally-saved attachment goes, derived from Obsidian's
// `attachmentFolderPath` setting.
//
// The setting has four shapes and they are easy to conflate:
//
//   ''        — not configured
//   '/'       — "Vault folder" (the root); NOT a path prefix
//   './'      — same folder as the note
//   './sub'   — a subfolder of the note's folder
//   'sub'     — a fixed vault folder
//
// Treating '/' as a prefix yields '//name.png', which Obsidian cannot resolve —
// reported as a real "image not found" failure by @nancyel in #1.

/**
 * Vault-relative path for a new attachment. Never returns a leading slash or a
 * doubled separator, both of which Obsidian rejects.
 */
export function resolveAttachmentPath(
	attachmentFolder: string,
	noteParentFolder: string,
	filename: string
): string {
	const setting = (attachmentFolder ?? '').trim();
	const parent = trimSlashes(noteParentFolder ?? '');

	if (setting === './') {
		return join(parent, filename);
	}
	if (setting.startsWith('./')) {
		return join(parent, trimSlashes(setting.slice(2)), filename);
	}

	// '' and '/' both mean the vault root — neither is a prefix.
	const fixed = trimSlashes(setting);
	return join(fixed, filename);
}

function trimSlashes(value: string): string {
	return value.replace(/^\/+|\/+$/g, '');
}

function join(...parts: string[]): string {
	return parts.filter(part => part.length > 0).join('/');
}
