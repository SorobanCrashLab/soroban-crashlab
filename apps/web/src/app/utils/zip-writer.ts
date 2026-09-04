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

function sanitizeZipPath(path: string): string {
    let sanitized = path.replace(/^[a-zA-Z]:/, '').replace(/^\/+/, '');
    sanitized = sanitized.split('/').filter(part => part !== '' && part !== '.').join('/');
    return sanitized || 'entry';
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

    const seenPaths = new Set<string>();
    const prepared = entries.map((entry) => {
        const safePath = sanitizeZipPath(entry.path);
        if (seenPaths.has(safePath)) {
            throw new Error(`Duplicate entry path in archive: ${safePath}`);
        }
        seenPaths.add(safePath);

        const nameBytes = encoder.encode(safePath);
        const dataBytes = encoder.encode(entry.content);
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
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const decoder = new TextDecoder();

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
    let cursor = view.getUint32(eocd + 16, true);
    const entries: ZipEntry[] = [];

    for (let i = 0; i < entryCount; i++) {
        if (view.getUint32(cursor, true) !== CENTRAL_HEADER_SIGNATURE) {
            throw new Error(`Corrupt central directory at entry ${i}`);
        }

        const method = view.getUint16(cursor + 10, true);
        if (method !== METHOD_STORE) {
            throw new Error(`Unsupported compression method ${method}`);
        }

        const expectedCrc = view.getUint32(cursor + 16, true);
        const size = view.getUint32(cursor + 24, true);
        const nameLength = view.getUint16(cursor + 28, true);
        const extraLength = view.getUint16(cursor + 30, true);
        const commentLength = view.getUint16(cursor + 32, true);
        const localOffset = view.getUint32(cursor + 42, true);

        const path = decoder.decode(bytes.subarray(cursor + CENTRAL_HEADER_SIZE, cursor + CENTRAL_HEADER_SIZE + nameLength));

        // Name and extra lengths are re-read from the local header: they are
        // allowed to differ from the central directory copy.
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const dataStart = localOffset + LOCAL_HEADER_SIZE + localNameLength + localExtraLength;
        const data = bytes.subarray(dataStart, dataStart + size);

        if (crc32(data) !== expectedCrc) {
            throw new Error(`CRC mismatch for entry ${path}`);
        }

        entries.push({ path, content: decoder.decode(data) });
        cursor += CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength;
    }

    return entries;
}
