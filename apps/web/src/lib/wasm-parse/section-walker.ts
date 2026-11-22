/**
 * WASM module section types and section walker.
 */

export enum SectionId {
    Custom = 0,
    Type = 1,
    Import = 2,
    Function = 3,
    Table = 4,
    Memory = 5,
    Global = 6,
    Export = 7,
    Start = 8,
    Element = 9,
    Code = 10,
    Data = 11,
    DataCount = 12,
}

export interface WasmSection {
    id: SectionId;
    name: string; // for custom sections
    start: number;
    size: number;
    data: Uint8Array;
}

export interface WasmModule {
    magic: number;
    version: number;
    sections: WasmSection[];
}

/**
 * Parses the WASM module header (magic + version).
 */
export function parseModuleHeader(buffer: Uint8Array, offset: number = 0): { module: WasmModule; offset: number } {
    if (offset + 8 > buffer.length) {
        throw new Error('Module header: buffer too small');
    }

    const magic = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24);
    if (magic !== 0x6d736100) { // '\0asm'
        throw new Error(`Invalid magic number: 0x${magic.toString(16)}`);
    }

    const version = buffer[offset + 4] | (buffer[offset + 5] << 8) | (buffer[offset + 6] << 16) | (buffer[offset + 7] << 24);
    if (version !== 1) {
        throw new Error(`Unsupported WASM version: ${version}`);
    }

    return {
        module: {
            magic,
            version,
            sections: [],
        },
        offset: offset + 8,
    };
}

/**
 * Walks through all sections in the module.
 * Returns array of sections with their parsed data.
 */
export function walkSections(buffer: Uint8Array, offset: number): WasmSection[] {
    const sections: WasmSection[] = [];

    while (offset < buffer.length) {
        // Read section id
        if (offset >= buffer.length) break;
        const sectionId = buffer[offset++];
        
        // Read section size (ULEB128)
        let size = 0;
        let shift = 0;
        let byte: number;
        do {
            if (offset >= buffer.length) {
                throw new Error('Section size: unexpected end of buffer');
            }
            byte = buffer[offset++];
            size |= (byte & 0x7f) << shift;
            shift += 7;
            if (shift > 32) {
                throw new Error('Section size: integer overflow');
            }
        } while ((byte & 0x80) !== 0);

        const start = offset;
        
        if (offset + size > buffer.length) {
            throw new Error(`Section ${sectionId}: size ${size} exceeds buffer bounds`);
        }

        const data = buffer.slice(offset, offset + size);
        offset += size;

        let name = '';
        if (sectionId === SectionId.Custom) {
            // Custom sections have a name prefix
            try {
                let nameOffset = 0;
                let nameLength = 0;
                let nameShift = 0;
                let nameByte: number;
                do {
                    if (nameOffset >= data.length) break;
                    nameByte = data[nameOffset++];
                    nameLength |= (nameByte & 0x7f) << nameShift;
                    nameShift += 7;
                } while ((nameByte & 0x80) !== 0);

                if (nameOffset + nameLength <= data.length) {
                    name = new TextDecoder().decode(data.slice(nameOffset, nameOffset + nameLength));
                }
            } catch {
                name = '';
            }
        }

        sections.push({
            id: sectionId,
            name,
            start,
            size,
            data,
        });
    }

    return sections;
}

/**
 * Parses the export section and returns exported functions.
 */
export interface ExportEntry {
    name: string;
    kind: number; // 0=func, 1=table, 2=mem, 3=global
    index: number;
}

export function parseExportSection(data: Uint8Array): ExportEntry[] {
    const exports: ExportEntry[] = [];
    let offset = 0;

    // Read vector length
    let count = 0;
    let shift = 0;
    let byte: number;
    do {
        if (offset >= data.length) break;
        byte = data[offset++];
        count |= (byte & 0x7f) << shift;
        shift += 7;
    } while ((byte & 0x80) !== 0);

    for (let i = 0; i < count; i++) {
        // Read export name
        let nameLen = 0;
        shift = 0;
        do {
            if (offset >= data.length) break;
            byte = data[offset++];
            nameLen |= (byte & 0x7f) << shift;
            shift += 7;
        } while ((byte & 0x80) !== 0);

        if (offset + nameLen > data.length) break;
        const name = new TextDecoder().decode(data.slice(offset, offset + nameLen));
        offset += nameLen;

        if (offset >= data.length) break;
        const kind = data[offset++];

        // Read index (ULEB128)
        let index = 0;
        shift = 0;
        do {
            if (offset >= data.length) break;
            byte = data[offset++];
            index |= (byte & 0x7f) << shift;
            shift += 7;
        } while ((byte & 0x80) !== 0);

        exports.push({ name, kind, index });
    }

    return exports;
}

/**
 * Parses the function type section.
 */
export interface FuncType {
    params: number[]; // valtype codes
    results: number[]; // valtype codes
}

export function parseTypeSection(data: Uint8Array): FuncType[] {
    const types: FuncType[] = [];
    let offset = 0;

    // Read vector length
    let count = 0;
    let shift = 0;
    let byte: number;
    do {
        if (offset >= data.length) break;
        byte = data[offset++];
        count |= (byte & 0x7f) << shift;
        shift += 7;
    } while ((byte & 0x80) !== 0);

    for (let i = 0; i < count; i++) {
        if (offset >= data.length) break;
        offset++; // form byte, always 0x60 (func type)
        
        // Read params
        let paramCount = 0;
        shift = 0;
        do {
            if (offset >= data.length) break;
            byte = data[offset++];
            paramCount |= (byte & 0x7f) << shift;
            shift += 7;
        } while ((byte & 0x80) !== 0);

        const params: number[] = [];
        for (let j = 0; j < paramCount; j++) {
            if (offset >= data.length) break;
            params.push(data[offset++]);
        }

        // Read results
        let resultCount = 0;
        shift = 0;
        do {
            if (offset >= data.length) break;
            byte = data[offset++];
            resultCount |= (byte & 0x7f) << shift;
            shift += 7;
        } while ((byte & 0x80) !== 0);

        const results: number[] = [];
        for (let j = 0; j < resultCount; j++) {
            if (offset >= data.length) break;
            results.push(data[offset++]);
        }

        types.push({ params, results });
    }

    return types;
}

/**
 * Parses custom "name" subsection for function names.
 */
export interface NameMap {
    moduleName?: string;
    functionNames: Map<number, string>;
}

export function parseNameSection(data: Uint8Array): NameMap {
    const result: NameMap = { functionNames: new Map() };
    let offset = 0;

    while (offset < data.length) {
        if (offset >= data.length) break;
        const subsectionType = data[offset++];

        // Read subsection size
        let size = 0;
        let shift = 0;
        let byte: number;
        do {
            if (offset >= data.length) break;
            byte = data[offset++];
            size |= (byte & 0x7f) << shift;
            shift += 7;
        } while ((byte & 0x80) !== 0);

        const subData = data.slice(offset, offset + size);
        offset += size;

        if (subsectionType === 1) { // function names
            let count = 0;
            shift = 0;
            let subOffset = 0;
            do {
                if (subOffset >= subData.length) break;
                byte = subData[subOffset++];
                count |= (byte & 0x7f) << shift;
                shift += 7;
            } while ((byte & 0x80) !== 0);

            for (let i = 0; i < count; i++) {
                // Read function index
                let funcIdx = 0;
                shift = 0;
                do {
                    if (subOffset >= subData.length) break;
                    byte = subData[subOffset++];
                    funcIdx |= (byte & 0x7f) << shift;
                    shift += 7;
                } while ((byte & 0x80) !== 0);

                // Read name
                let nameLen = 0;
                shift = 0;
                do {
                    if (subOffset >= subData.length) break;
                    byte = subData[subOffset++];
                    nameLen |= (byte & 0x7f) << shift;
                    shift += 7;
                } while ((byte & 0x80) !== 0);

                if (subOffset + nameLen <= subData.length) {
                    const name = new TextDecoder().decode(subData.slice(subOffset, subOffset + nameLen));
                    subOffset += nameLen;
                    result.functionNames.set(funcIdx, name);
                }
            }
        } else if (subsectionType === 0) { // module name
            let nameLen = 0;
            shift = 0;
            let subOffset = 0;
            do {
                if (subOffset >= subData.length) break;
                byte = subData[subOffset++];
                nameLen |= (byte & 0x7f) << shift;
                shift += 7;
            } while ((byte & 0x80) !== 0);

            if (subOffset + nameLen <= subData.length) {
                result.moduleName = new TextDecoder().decode(subData.slice(subOffset, subOffset + nameLen));
            }
        }
    }

    return result;
}