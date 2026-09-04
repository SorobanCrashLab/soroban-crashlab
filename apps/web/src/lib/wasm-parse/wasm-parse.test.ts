/**
 * Hostile corpus tests for WASM parser.
 * Mutation-generated garbage binaries - parser must return clean typed errors, never throw.
 */

import { parseContractWasm, MAX_MODULE_SIZE, proposeFuzzTargets } from './index';
import { readULEB128, readSLEB128, readString, readBytes, readU32, readU64, readByte } from './binary-reader';

describe('WASM binary reader primitives', () => {
    describe('readULEB128', () => {
        it('decodes small values', () => {
            expect(readULEB128(new Uint8Array([0x00]), 0)).toEqual({ value: 0, offset: 1 });
            expect(readULEB128(new Uint8Array([0x7f]), 0)).toEqual({ value: 127, offset: 1 });
        });

        it('decodes multi-byte values', () => {
            // 128 = 0x80 0x01
            expect(readULEB128(new Uint8Array([0x80, 0x01]), 0)).toEqual({ value: 128, offset: 2 });
            // 16384 = 0x80 0x80 0x01
            expect(readULEB128(new Uint8Array([0x80, 0x80, 0x01]), 0)).toEqual({ value: 16384, offset: 3 });
        });

        it('throws on truncated input', () => {
            expect(() => readULEB128(new Uint8Array([0x80]), 0)).toThrow('ULEB128: unexpected end of buffer');
        });

        it('throws on overflow', () => {
            // 10 bytes all with high bit set = overflow
            const buf = new Uint8Array(10).fill(0x80);
            buf[9] = 0x01;
            expect(() => readULEB128(buf, 0)).toThrow('ULEB128: integer overflow');
        });
    });

    describe('readSLEB128', () => {
        it('decodes positive values', () => {
            expect(readSLEB128(new Uint8Array([0x00]), 0)).toEqual({ value: 0, offset: 1 });
            expect(readSLEB128(new Uint8Array([0x7f]), 0)).toEqual({ value: 127, offset: 1 });
        });

        it('decodes negative values', () => {
            // -1 = 0x7f
            expect(readSLEB128(new Uint8Array([0x7f]), 0)).toEqual({ value: -1, offset: 1 });
            // -128 = 0x80 0x7f
            expect(readSLEB128(new Uint8Array([0x80, 0x7f]), 0)).toEqual({ value: -128, offset: 2 });
        });

        it('throws on overflow', () => {
            const buf = new Uint8Array(10).fill(0x80);
            buf[9] = 0x01;
            expect(() => readSLEB128(buf, 0)).toThrow('SLEB128: integer overflow');
        });
    });

    describe('readString', () => {
        it('reads empty string', () => {
            expect(readString(new Uint8Array([0x00]), 0)).toEqual({ value: '', offset: 1 });
        });

        it('reads simple string', () => {
            const buf = new Uint8Array([0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f]); // "hello"
            expect(readString(buf, 0)).toEqual({ value: 'hello', offset: 6 });
        });

        it('throws on underflow', () => {
            const buf = new Uint8Array([0x05, 0x68, 0x65]); // claims 5 bytes, only 2
            expect(() => readString(buf, 0)).toThrow('String: buffer underflow');
        });
    });

    describe('readBytes', () => {
        it('reads empty bytes', () => {
            const { value, offset } = readBytes(new Uint8Array([0x00]), 0);
            expect(value).toEqual(new Uint8Array(0));
            expect(offset).toBe(1);
        });

        it('reads bytes', () => {
            const buf = new Uint8Array([0x03, 0x01, 0x02, 0x03]);
            const { value, offset } = readBytes(buf, 0);
            expect(value).toEqual(new Uint8Array([1, 2, 3]));
            expect(offset).toBe(4);
        });

        it('throws on underflow', () => {
            const buf = new Uint8Array([0x05, 0x01, 0x02]);
            expect(() => readBytes(buf, 0)).toThrow('Bytes: buffer underflow');
        });
    });

    describe('readU32', () => {
        it('reads little-endian u32', () => {
            const buf = new Uint8Array([0x78, 0x56, 0x34, 0x12]); // 0x12345678
            expect(readU32(buf, 0)).toEqual({ value: 0x12345678, offset: 4 });
        });

        it('throws on underflow', () => {
            expect(() => readU32(new Uint8Array([1, 2, 3]), 0)).toThrow('U32: buffer underflow');
        });
    });

    describe('readU64', () => {
        it('reads little-endian u64 within safe range', () => {
            const buf = new Uint8Array([0x78, 0x56, 0x34, 0x12, 0x00, 0x00, 0x00, 0x00]);
            expect(readU64(buf, 0)).toEqual({ value: 0x12345678, offset: 8 });
        });

        it('throws on overflow beyond MAX_SAFE_INTEGER', () => {
            const buf = new Uint8Array(8).fill(0xff);
            expect(() => readU64(buf, 0)).toThrow('U64: value exceeds MAX_SAFE_INTEGER');
        });

        it('throws on underflow', () => {
            expect(() => readU64(new Uint8Array(4), 0)).toThrow('U64: buffer underflow');
        });
    });

    describe('readByte', () => {
        it('reads single byte', () => {
            expect(readByte(new Uint8Array([0x42]), 0)).toEqual({ value: 0x42, offset: 1 });
        });

        it('throws on empty buffer', () => {
            expect(() => readByte(new Uint8Array(0), 0)).toThrow('Byte: buffer underflow');
        });
    });
});

describe('WASM module parser - hostile corpus', () => {
    it('rejects empty buffer', () => {
        expect(() => parseContractWasm(new Uint8Array(0))).toThrow('Module header: buffer too small');
    });

    it('rejects invalid magic', () => {
        const buf = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
        expect(() => parseContractWasm(buf)).toThrow('Invalid magic number');
    });

    it('rejects unsupported version', () => {
        const buf = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x02, 0x00, 0x00, 0x00]);
        expect(() => parseContractWasm(buf)).toThrow('Unsupported WASM version');
    });

    it('rejects module exceeding 16MB', () => {
        const buf = new Uint8Array(MAX_MODULE_SIZE + 1);
        buf[0] = 0x00; buf[1] = 0x61; buf[2] = 0x73; buf[3] = 0x6d;
        buf[4] = 0x01; buf[5] = 0x00; buf[6] = 0x00; buf[7] = 0x00;
        expect(() => parseContractWasm(buf)).toThrow('exceeds');
    });

    it('handles truncated module header', () => {
        expect(() => parseContractWasm(new Uint8Array([0x00, 0x61, 0x73]))).toThrow('Module header: buffer too small');
    });

    it('handles truncated section size', () => {
        // Valid header + section id but truncated size
        const buf = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x07, 0x80]);
        expect(() => parseContractWasm(buf)).toThrow();
    });

    it('handles section size exceeding buffer', () => {
        const buf = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x07, 0x05, 0x01, 0x02]);
        expect(() => parseContractWasm(buf)).toThrow('exceeds buffer bounds');
    });

    it('handles truncated export section', () => {
        // Valid header + export section with count but no entries
        const buf = new Uint8Array([
            0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // header
            0x07, 0x03, 0x01, 0x00, // export section, size=3, count=1, then truncated
        ]);
        expect(() => parseContractWasm(buf)).toThrow();
    });

    it('handles truncated type section', () => {
        const buf = new Uint8Array([
            0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
            0x01, 0x04, 0x01, 0x60, 0x02, // type section, size=4, count=1, func form, 2 params... truncated
        ]);
        expect(() => parseContractWasm(buf)).toThrow();
    });

    it('handles truncated custom name section', () => {
        const buf = new Uint8Array([
            0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
            0x00, 0x05, 0x04, 0x6e, 0x61, 0x6d, 0x65, // custom section "name"
            0x01, 0x00, // subsection type 1 (func names), size 0 - truncated
        ]);
        // Should not throw, just return empty name map
        const result = parseContractWasm(buf);
        expect(result).toBeDefined();
    });

    it('handles malformed LEB128 in export count', () => {
        const buf = new Uint8Array([
            0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
            0x07, 0x02, 0x80, 0x80, 0x80, 0x80, 0x80, // export section, overflow count
        ]);
        expect(() => parseContractWasm(buf)).toThrow();
    });

    it('handles zero exports gracefully', () => {
        const buf = new Uint8Array([
            0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
            0x07, 0x01, 0x00, // export section, count=0
        ]);
        const result = parseContractWasm(buf);
        expect(result.exportedFunctions).toEqual([]);
    });

    it('handles export with unknown kind', () => {
        const buf = new Uint8Array([
            0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
            0x07, 0x06, 0x01, 0x03, 0x66, 0x6f, 0x6f, 0x05, 0x00, // export section, kind=5 (invalid)
        ]);
        const result = parseContractWasm(buf);
        // Should filter out non-function exports
        expect(result.exportedFunctions).toEqual([]);
    });

    it('handles multiple sections out of order', () => {
        const buf = new Uint8Array([
            0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
            0x07, 0x01, 0x00, // export section first
            0x01, 0x04, 0x01, 0x60, 0x00, 0x00, // type section second
        ]);
        const result = parseContractWasm(buf);
        expect(result.types).toHaveLength(1);
    });

    it('handles very large section count', () => {
        // Many sections - stress test walker
        let buf = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
        // Add 100 empty custom sections
        for (let i = 0; i < 100; i++) {
            const section = new Uint8Array([0x00, 0x01, 0x00]); // custom, size 1, empty name
            buf = new Uint8Array([...buf, ...section]);
        }
        const result = parseContractWasm(buf);
        expect(result.module.sections.length).toBe(100);
    });

    it('handles name subsection with truncated function name', () => {
        const buf = new Uint8Array([
            0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
            0x00, 0x08, 0x04, 0x6e, 0x61, 0x6d, 0x65, // custom "name"
            0x01, 0x03, // func names subsection, size 3
            0x01, 0x03, 0x66, // count=1, func idx=1, name len=3 but only "fo"
        ]);
        // Should not throw
        const result = parseContractWasm(buf);
        expect(result.nameMap.functionNames.size).toBeLessThanOrEqual(1);
    });

    it('handles export index out of type section bounds', () => {
        const buf = new Uint8Array([
            0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
            0x07, 0x05, 0x01, 0x03, 0x66, 0x6f, 0x6f, 0x00, 0x05, // export func idx 5
            0x01, 0x02, 0x01, 0x60, 0x00, // type section with only 1 type
        ]);
        const result = parseContractWasm(buf);
        // Should handle gracefully - empty type fallback
        expect(result.exportedFunctions.length).toBe(1);
        expect(result.exportedFunctions[0].paramTypes).toEqual([]);
    });
});

describe('Fuzz target proposer', () => {
    it('generates descriptors for exported functions', () => {
        
        // Create a mock parsed contract
        const mockContract = {
            exportedFunctions: [
                {
                    name: 'transfer',
                    exportIndex: 0,
                    funcIndex: 0,
                    paramTypes: [0x7f, 0x7f, 0x7e], // i32, i32, i64
                    resultTypes: [0x7f],
                    paramNames: ['from', 'to', 'amount'],
                },
            ],
        };
        
        const targets = proposeFuzzTargets(mockContract);
        expect(targets).toHaveLength(1);
        expect(targets[0].method).toBe('transfer');
        expect(targets[0].argTemplates).toHaveLength(3);
        expect(targets[0].argTemplates[0].type).toBe('i32');
        expect(targets[0].argTemplates[1].type).toBe('i32');
        expect(targets[0].argTemplates[2].type).toBe('i64');
        expect(targets[0].argTemplates.every(a => a.isGuess)).toBe(true);
    });

    it('handles functions with no params', () => {
        
        const mockContract = {
            exportedFunctions: [
                {
                    name: 'get_balance',
                    exportIndex: 0,
                    funcIndex: 0,
                    paramTypes: [],
                    resultTypes: [0x7f],
                    paramNames: [],
                },
            ],
        };
        
        const targets = proposeFuzzTargets(mockContract);
        expect(targets[0].argTemplates).toHaveLength(0);
    });

    it('handles all valtype codes', () => {
        
        const mockContract = {
            exportedFunctions: [
                {
                    name: 'test_all',
                    exportIndex: 0,
                    funcIndex: 0,
                    paramTypes: [0x7f, 0x7e, 0x7d, 0x7c, 0x7b, 0x70, 0x6f],
                    resultTypes: [],
                    paramNames: [],
                },
            ],
        };
        
        const targets = proposeFuzzTargets(mockContract);
        expect(targets[0].argTemplates).toHaveLength(7);
        const types = targets[0].argTemplates.map(a => a.type);
        expect(types).toEqual(['i32', 'i64', 'f32', 'f64', 'v128', 'funcref', 'externref']);
    });
});