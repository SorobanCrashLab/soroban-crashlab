/**
 * Minimal ZIP archive writer and reader (#1120).
 *
 * The artifact bundle download needs to produce a file that real unzip tools
 * can open, and the app ships no archiving dependency. Entries are written with
 * the STORE method (no compression): artifact bundles are small JSON documents,
 * and storing them keeps this module short enough to audit and test, with no
 * DEFLATE implementation to get wrong.
 *
 * Format reference: PKWARE APPNOTE.TXT sections 4.3.7 (local file header),
 * 4.3.12 (central directory header) and 4.3.16 (end of central directory).
 */

/** One file inside the archive. */
export interface ZipEntry {
    /** Path within the archive, using forward slashes. */
    path: string;
    /** UTF-8 text content. */
    content: string;
}

export interface CreateZipOptions {
    /**
     * Timestamp stamped on every entry. Defaults to now; pass a fixed date to
     * get byte-identical output for the same input.
     */
    modifiedAt?: Date;
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;

const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const EOCD_SIZE = 22;
const MAX_ZIP_ENTRIES = 500;
const MAX_ZIP_ENTRY_BYTES = 4 * 1024 * 1024;
const MAX_ZIP_TOTAL_BYTES = 16 * 1024 * 1024;
const MAX_ZIP_PATH_BYTES = 512;
const MAX_ZIP_ARCHIVE_BYTES = MAX_ZIP_TOTAL_BYTES + MAX_ZIP_ENTRIES * (LOCAL_HEADER_SIZE + CENTRAL_HEADER_SIZE + MAX_ZIP_PATH_BYTES) + EOCD_SIZE;

/** Version 2.0: the minimum that understands the fields we write. */
const VERSION = 20;
/** General purpose bit 11 — filenames and comments are UTF-8. */
const UTF8_FLAG = 0x0800;
/** Compression method 0 — stored, no compression. */
const METHOD_STORE = 0;

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
    if (crcTable) return crcTable;

    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let value = i;
        for (let bit = 0; bit < 8; bit++) {
            value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        table[i] = value >>> 0;
    }

    crcTable = table;
    return table;
}

/** Standard CRC-32 (IEEE 802.3 polynomial), as required by the ZIP format. */
export function crc32(bytes: Uint8Array): number {
    const table = getCrcTable();
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/** Packs a date into the DOS time/date pair ZIP headers use. */
function toDosDateTime(date: Date): { time: number; date: number } {
    // The DOS epoch starts in 1980 and stores seconds in 2-second steps.
    const year = Math.max(date.getFullYear(), 1980);
    const time =
        ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
    const dosDate =
        (((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
    return { time, date: dosDate };
}

function validateZipPath(path: string): string {
    if (!path || path.includes('\\') || path.includes('\0') || /^[a-zA-Z]:/.test(path) || path.startsWith('/')) {
        throw new Error('Invalid ZIP entry path');
    }
    const segments = path.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
        throw new Error('ZIP entry path contains an unsafe segment');
    }
    if ([...path].some((character) => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f)) {
        throw new Error('ZIP entry path contains a control character');
    }
    return path;
}

/**
 * Builds a ZIP archive from `entries`.
 *
 * @throws if two entries share the same path, which would produce an archive
 *         whose contents depend on the extractor.
 */
export function createZipArchive(
    entries: readonly ZipEntry[],
    options: CreateZipOptions = {},
): Uint8Array {
    const encoder = new TextEncoder();
    const { time, date } = toDosDateTime(options.modifiedAt ?? new Date());
    if (entries.length > MAX_ZIP_ENTRIES) {
        throw new Error(`ZIP archive exceeds the ${MAX_ZIP_ENTRIES} entry limit`);
    }

    const seenPaths = new Set<string>();
    let totalBytes = 0;
    const prepared = entries.map((entry) => {
        const safePath = validateZipPath(entry.path);
        if (seenPaths.has(safePath)) {
            throw new Error(`Duplicate entry path in archive: ${safePath}`);
        }
        seenPaths.add(safePath);

        const nameBytes = encoder.encode(safePath);
        if (nameBytes.byteLength > MAX_ZIP_PATH_BYTES) {
            throw new Error(`ZIP entry path exceeds the ${MAX_ZIP_PATH_BYTES} byte limit`);
        }
        const dataBytes = encoder.encode(entry.content);
        if (dataBytes.byteLength > MAX_ZIP_ENTRY_BYTES) {
            throw new Error(`ZIP entry exceeds the ${MAX_ZIP_ENTRY_BYTES} byte limit`);
        }
        totalBytes += dataBytes.byteLength;
        if (totalBytes > MAX_ZIP_TOTAL_BYTES) {
            throw new Error(`ZIP archive exceeds the ${MAX_ZIP_TOTAL_BYTES} byte uncompressed limit`);
        }
        return { nameBytes, dataBytes, crc: crc32(dataBytes), offset: 0 };
    });

    const localSize = prepared.reduce(
        (total, entry) => total + LOCAL_HEADER_SIZE + entry.nameBytes.length + entry.dataBytes.length,
        0,
    );
    const centralSize = prepared.reduce(
        (total, entry) => total + CENTRAL_HEADER_SIZE + entry.nameBytes.length,
        0,
    );

    const buffer = new Uint8Array(localSize + centralSize + EOCD_SIZE);
    const view = new DataView(buffer.buffer);
    let cursor = 0;

    // ── Local file headers, each followed by its stored data ──────────────────
    for (const entry of prepared) {
        entry.offset = cursor;

        view.setUint32(cursor, LOCAL_HEADER_SIGNATURE, true);
        view.setUint16(cursor + 4, VERSION, true);
        view.setUint16(cursor + 6, UTF8_FLAG, true);
        view.setUint16(cursor + 8, METHOD_STORE, true);
        view.setUint16(cursor + 10, time, true);
        view.setUint16(cursor + 12, date, true);
        view.setUint32(cursor + 14, entry.crc, true);
        view.setUint32(cursor + 18, entry.dataBytes.length, true); // compressed size
        view.setUint32(cursor + 22, entry.dataBytes.length, true); // uncompressed size
        view.setUint16(cursor + 26, entry.nameBytes.length, true);
        view.setUint16(cursor + 28, 0, true); // extra field length
        cursor += LOCAL_HEADER_SIZE;

        buffer.set(entry.nameBytes, cursor);
        cursor += entry.nameBytes.length;

        buffer.set(entry.dataBytes, cursor);
        cursor += entry.dataBytes.length;
    }

    // ── Central directory ────────────────────────────────────────────────────
    const centralStart = cursor;
    for (const entry of prepared) {
        view.setUint32(cursor, CENTRAL_HEADER_SIGNATURE, true);
        view.setUint16(cursor + 4, VERSION, true); // version made by
        view.setUint16(cursor + 6, VERSION, true); // version needed
        view.setUint16(cursor + 8, UTF8_FLAG, true);
        view.setUint16(cursor + 10, METHOD_STORE, true);
        view.setUint16(cursor + 12, time, true);
        view.setUint16(cursor + 14, date, true);
        view.setUint32(cursor + 16, entry.crc, true);
        view.setUint32(cursor + 20, entry.dataBytes.length, true);
        view.setUint32(cursor + 24, entry.dataBytes.length, true);
        view.setUint16(cursor + 28, entry.nameBytes.length, true);
        view.setUint16(cursor + 30, 0, true); // extra field length
        view.setUint16(cursor + 32, 0, true); // comment length
        view.setUint16(cursor + 34, 0, true); // disk number start
        view.setUint16(cursor + 36, 0, true); // internal attributes
        view.setUint32(cursor + 38, 0, true); // external attributes
        view.setUint32(cursor + 42, entry.offset, true);
        cursor += CENTRAL_HEADER_SIZE;

        buffer.set(entry.nameBytes, cursor);
        cursor += entry.nameBytes.length;
    }

    // ── End of central directory ─────────────────────────────────────────────
    view.setUint32(cursor, EOCD_SIGNATURE, true);
    view.setUint16(cursor + 4, 0, true); // this disk number
    view.setUint16(cursor + 6, 0, true); // disk with central directory
    view.setUint16(cursor + 8, prepared.length, true);
    view.setUint16(cursor + 10, prepared.length, true);
    view.setUint32(cursor + 12, cursor - centralStart, true);
    view.setUint32(cursor + 16, centralStart, true);
    view.setUint16(cursor + 20, 0, true); // archive comment length

    return buffer;
}

/**
 * Reads back an archive produced by {@link createZipArchive}.
 *
 * Supports only stored (uncompressed) entries — enough to verify our own output
 * without pulling in a decompressor.
 */
export function readZipArchive(bytes: Uint8Array): ZipEntry[] {
    if (bytes.byteLength > MAX_ZIP_ARCHIVE_BYTES) {
        throw new Error(`ZIP archive exceeds the ${MAX_ZIP_ARCHIVE_BYTES} byte limit`);
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const decoder = new TextDecoder('utf-8', { fatal: true });

    // The EOCD sits at the end, after an optional comment, so scan backwards.
    let eocd = -1;
    for (let i = bytes.length - EOCD_SIZE; i >= 0; i--) {
        if (view.getUint32(i, true) === EOCD_SIGNATURE) {
            eocd = i;
            break;
        }
    }
    if (eocd === -1) {
        throw new Error('Not a ZIP archive: end of central directory record not found');
    }

    const entryCount = view.getUint16(eocd + 10, true);
    if (entryCount > MAX_ZIP_ENTRIES) {
        throw new Error(`ZIP archive exceeds the ${MAX_ZIP_ENTRIES} entry limit`);
    }
    let cursor = view.getUint32(eocd + 16, true);
    const entries: ZipEntry[] = [];
    let totalBytes = 0;

    for (let i = 0; i < entryCount; i++) {
        if (cursor + CENTRAL_HEADER_SIZE > bytes.byteLength) {
            throw new Error(`Truncated central directory at entry ${i}`);
        }
        if (view.getUint32(cursor, true) !== CENTRAL_HEADER_SIGNATURE) {
            throw new Error(`Corrupt central directory at entry ${i}`);
        }

        const method = view.getUint16(cursor + 10, true);
        if (method !== METHOD_STORE) {
            throw new Error(`Unsupported compression method ${method}`);
        }

        const expectedCrc = view.getUint32(cursor + 16, true);
        const compressedSize = view.getUint32(cursor + 20, true);
        const size = view.getUint32(cursor + 24, true);
        const nameLength = view.getUint16(cursor + 28, true);
        const extraLength = view.getUint16(cursor + 30, true);
        const commentLength = view.getUint16(cursor + 32, true);
        const localOffset = view.getUint32(cursor + 42, true);

        if (size > MAX_ZIP_ENTRY_BYTES) {
            throw new Error(`ZIP entry exceeds the ${MAX_ZIP_ENTRY_BYTES} byte limit`);
        }
        if (compressedSize !== size) {
            throw new Error(`Stored ZIP entry has inconsistent sizes`);
        }
        totalBytes += size;
        if (totalBytes > MAX_ZIP_TOTAL_BYTES) {
            throw new Error(`ZIP archive exceeds the ${MAX_ZIP_TOTAL_BYTES} byte uncompressed limit`);
        }
        const nameStart = cursor + CENTRAL_HEADER_SIZE;
        if (nameStart + nameLength + extraLength + commentLength > bytes.byteLength) {
            throw new Error(`Truncated central directory entry ${i}`);
        }
        const path = validateZipPath(decoder.decode(bytes.subarray(nameStart, nameStart + nameLength)));

        // Name and extra lengths are re-read from the local header: they are
        // allowed to differ from the central directory copy.
        if (localOffset + LOCAL_HEADER_SIZE > bytes.byteLength) {
            throw new Error(`Invalid local header offset for entry ${path}`);
        }
        if (view.getUint32(localOffset, true) !== LOCAL_HEADER_SIGNATURE) {
            throw new Error(`Invalid local file header for entry ${path}`);
        }
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const localNameStart = localOffset + LOCAL_HEADER_SIZE;
        const dataStart = localNameStart + localNameLength + localExtraLength;
        if (dataStart > bytes.byteLength) {
            throw new Error(`Truncated local header for entry ${path}`);
        }
        const localPath = validateZipPath(
            decoder.decode(bytes.subarray(localNameStart, localNameStart + localNameLength)),
        );
        if (localPath !== path) {
            throw new Error(`ZIP entry path mismatch for ${path}`);
        }
        if (dataStart + size > bytes.byteLength) {
            throw new Error(`Truncated data for entry ${path}`);
        }
        const data = bytes.subarray(dataStart, dataStart + size);

        if (crc32(data) !== expectedCrc) {
            throw new Error(`CRC mismatch for entry ${path}`);
        }

        entries.push({ path, content: decoder.decode(data) });
        cursor += CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength;
    }

    return entries;
}
