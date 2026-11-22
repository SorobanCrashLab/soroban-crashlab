/**
 * Binary reader primitives for WASM parsing (LEB128, section walker).
 * Designed to be hostile-input safe: bounds-checked, no throws on malformed input.
 */

export interface ReadResult<T> {
    value: T;
    offset: number;
}

/**
 * Decodes an unsigned LEB128 integer from the buffer.
 * Returns { value, newOffset } or throws on overflow/underflow.
 */
export function readULEB128(buffer: Uint8Array, offset: number): ReadResult<number> {
    let value = 0;
    let shift = 0;
    let byte: number;

    do {
        if (offset >= buffer.length) {
            throw new Error('ULEB128: unexpected end of buffer');
        }
        byte = buffer[offset++];
        value |= (byte & 0x7f) << shift;
        shift += 7;
        if (shift > 63) {
            throw new Error('ULEB128: integer overflow (shift > 63)');
        }
    } while ((byte & 0x80) !== 0);

    return { value, offset };
}

/**
 * Decodes a signed LEB128 integer from the buffer.
 */
export function readSLEB128(buffer: Uint8Array, offset: number): ReadResult<number> {
    let value = 0;
    let shift = 0;
    let byte: number;
    let size = 0;

    do {
        if (offset >= buffer.length) {
            throw new Error('SLEB128: unexpected end of buffer');
        }
        byte = buffer[offset++];
        value |= (byte & 0x7f) << shift;
        shift += 7;
        size += 7;
        if (size > 64) {
            throw new Error('SLEB128: integer overflow');
        }
    } while ((byte & 0x80) !== 0);

    // Sign extend
    if ((byte & 0x40) !== 0 && shift < 64) {
        value |= ~0 << shift;
    }

    return { value, offset };
}

/**
 * Reads a UTF-8 string (length-prefixed with ULEB128).
 */
export function readString(buffer: Uint8Array, offset: number): ReadResult<string> {
    const { value: length, offset: newOffset } = readULEB128(buffer, offset);
    
    if (newOffset + length > buffer.length) {
        throw new Error('String: buffer underflow');
    }
    
    const str = new TextDecoder().decode(buffer.slice(newOffset, newOffset + length));
    return { value: str, offset: newOffset + length };
}

/**
 * Reads a byte vector (length-prefixed with ULEB128).
 */
export function readBytes(buffer: Uint8Array, offset: number): ReadResult<Uint8Array> {
    const { value: length, offset: newOffset } = readULEB128(buffer, offset);
    
    if (newOffset + length > buffer.length) {
        throw new Error('Bytes: buffer underflow');
    }
    
    const bytes = buffer.slice(newOffset, newOffset + length);
    return { value: bytes, offset: newOffset + length };
}

/**
 * Reads a 32-bit unsigned integer (little-endian).
 */
export function readU32(buffer: Uint8Array, offset: number): ReadResult<number> {
    if (offset + 4 > buffer.length) {
        throw new Error('U32: buffer underflow');
    }
    const value = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24);
    return { value, offset: offset + 4 };
}

/**
 * Reads a 64-bit unsigned integer (little-endian) as number (safe up to 2^53-1).
 */
export function readU64(buffer: Uint8Array, offset: number): ReadResult<number> {
    if (offset + 8 > buffer.length) {
        throw new Error('U64: buffer underflow');
    }
    const low = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24);
    const high = buffer[offset + 4] | (buffer[offset + 5] << 8) | (buffer[offset + 6] << 16) | (buffer[offset + 7] << 24);
    const value = high * 0x100000000 + low;
    if (value > Number.MAX_SAFE_INTEGER) {
        throw new Error('U64: value exceeds MAX_SAFE_INTEGER');
    }
    return { value, offset: offset + 8 };
}

/**
 * Reads a single byte.
 */
export function readByte(buffer: Uint8Array, offset: number): ReadResult<number> {
    if (offset >= buffer.length) {
        throw new Error('Byte: buffer underflow');
    }
    return { value: buffer[offset], offset: offset + 1 };
}

/**
 * Peeks at the next byte without advancing offset.
 */
export function peekByte(buffer: Uint8Array, offset: number): number | null {
    if (offset >= buffer.length) return null;
    return buffer[offset];
}

/**
 * Checks if there are at least `n` bytes remaining.
 */
export function hasRemaining(buffer: Uint8Array, offset: number, n: number): boolean {
    return offset + n <= buffer.length;
}