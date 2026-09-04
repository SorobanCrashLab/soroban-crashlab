/**
 * WASM module parser - main entry point for parsing contract WASM.
 */

import { WasmModule, parseModuleHeader, walkSections, parseExportSection, parseTypeSection, parseNameSection, ExportEntry, FuncType, NameMap } from './section-walker';

export interface ParsedContract {
    module: WasmModule;
    exports: ExportEntry[];
    types: FuncType[];
    nameMap: NameMap;
    exportedFunctions: ExportedFunction[];
}

export interface ExportedFunction {
    name: string;
    exportIndex: number;
    funcIndex: number;
    paramTypes: number[];
    resultTypes: number[];
    paramNames: string[]; // heuristic or from name section
}

/**
 * Maximum allowed module size (16MB as per requirements).
 */
export const MAX_MODULE_SIZE = 16 * 1024 * 1024;

/**
 * Parses a WASM module buffer and extracts contract interface information.
 * Throws typed errors for malformed/oversized modules.
 */
export function parseContractWasm(buffer: Uint8Array): ParsedContract {
    if (buffer.length > MAX_MODULE_SIZE) {
        throw new Error(`Module size ${buffer.length} bytes exceeds ${MAX_MODULE_SIZE} byte limit`);
    }

    // Parse header
    const { module, offset } = parseModuleHeader(buffer);
    
    // Walk sections
    const sections = walkSections(buffer, offset);
    module.sections = sections;

    // Parse relevant sections
    let exports: ExportEntry[] = [];
    let types: FuncType[] = [];
    let nameMap: NameMap = { functionNames: new Map() };

    for (const section of sections) {
        switch (section.id) {
            case 7: // Export section
                exports = parseExportSection(section.data);
                break;
            case 1: // Type section
                types = parseTypeSection(section.data);
                break;
            case 0: // Custom section - check for "name"
                if (section.name === 'name') {
                    nameMap = parseNameSection(section.data);
                }
                break;
        }
    }

    // Build exported functions with type information
    const exportedFunctions: ExportedFunction[] = exports
        .filter(exp => exp.kind === 0) // only functions
        .map(exp => {
            const funcType = types[exp.index] || { params: [], results: [] };
            // Generate heuristic parameter names based on types
            const paramNames = funcType.params.map((t, idx) => {
                if (nameMap.functionNames.has(exp.index + idx)) {
                    // unlikely but possible
                    return nameMap.functionNames.get(exp.index + idx) || `param${idx}`;
                }
                return heuristicParamName(t, idx);
            });

            return {
                name: exp.name,
                exportIndex: exports.indexOf(exp),
                funcIndex: exp.index,
                paramTypes: funcType.params,
                resultTypes: funcType.results,
                paramNames,
            };
        });

    return {
        module,
        exports,
        types,
        nameMap,
        exportedFunctions,
    };
}

/**
 * Heuristic parameter name based on WASM valtype.
 * Valtype codes: 0x7f=i32, 0x7e=i64, 0x7d=f32, 0x7c=f64, 0x7b=v128, 0x70=funcref, 0x6f=externref
 */
export function heuristicParamName(valtype: number, index: number): string {
    switch (valtype) {
        case 0x7f: return `i32_${index}`;      // i32
        case 0x7e: return `i64_${index}`;      // i64
        case 0x7d: return `f32_${index}`;      // f32
        case 0x7c: return `f64_${index}`;      // f64
        case 0x7b: return `v128_${index}`;     // v128
        case 0x70: return `funcref_${index}`;  // funcref
        case 0x6f: return `externref_${index}`;// externref
        default: return `param_${index}`;
    }
}

/**
 * Human-readable valtype name for UI.
 */
export function valtypeName(valtype: number): string {
    switch (valtype) {
        case 0x7f: return 'i32';
        case 0x7e: return 'i64';
        case 0x7d: return 'f32';
        case 0x7c: return 'f64';
        case 0x7b: return 'v128';
        case 0x70: return 'funcref';
        case 0x6f: return 'externref';
        default: return `unknown(0x${valtype.toString(16)})`;
    }
}

/**
 * Fuzz target descriptor for UI cards.
 */
export interface FuzzTargetDescriptor {
    method: string;
    argTemplates: ArgTemplate[];
    source: 'parsed' | 'heuristic';
}

export interface ArgTemplate {
    name: string;
    type: string;
    template: string; // example value or pattern
    isGuess: boolean;
}

/**
 * Proposes fuzz target descriptors from parsed contract.
 */
export function proposeFuzzTargets(contract: ParsedContract): FuzzTargetDescriptor[] {
    return contract.exportedFunctions.map(fn => {
        const argTemplates: ArgTemplate[] = fn.paramTypes.map((valtype, idx) => {
            const template = heuristicTemplate(valtype);
            return {
                name: fn.paramNames[idx] || `arg${idx}`,
                type: valtypeName(valtype),
                template,
                isGuess: true,
            };
        });

        return {
            method: fn.name,
            argTemplates,
            source: 'heuristic',
        };
    });
}

/**
 * Generates a heuristic template value for a WASM valtype.
 */
function heuristicTemplate(valtype: number): string {
    switch (valtype) {
        case 0x7f: return '0';           // i32
        case 0x7e: return '0';           // i64
        case 0x7d: return '0.0';         // f32
        case 0x7c: return '0.0';         // f64
        case 0x7b: return '0x0';         // v128
        case 0x70: return 'null';        // funcref
        case 0x6f: return 'null';        // externref
        default: return '0';
    }
}

/**
 * Parses a WASM file from a File object (browser).
 */
export async function parseContractWasmFile(file: File): Promise<ParsedContract> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    return parseContractWasm(buffer);
}