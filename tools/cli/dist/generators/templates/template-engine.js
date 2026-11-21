/**
 * Simple template engine for code generation.
 * Supports variable substitution and basic control structures.
 */
export function template(arg, ...args) {
    let str;
    let context;
    if (typeof arg === 'string') {
        str = arg;
        context = (args[0] ?? {});
    }
    else {
        str = arg.join('');
        context = {};
        args.forEach((arg, i) => {
            if (typeof arg === 'object') {
                Object.assign(context, arg);
            }
            else {
                context[`${i}`] = arg;
            }
        });
    }
    let result = str;
    // First pass: handle function calls
    const functionCalls = [
        { pattern: /\$pascalCase\((\w+)\)/g, fn: (s) => pascalCase(s) },
        { pattern: /\$kebabCase\((\w+)\)/g, fn: (s) => kebabCase(s) },
        { pattern: /\$camelCase\((\w+)\)/g, fn: (s) => camelCase(s) },
        { pattern: /\$templateName\((\w+)\)/g, fn: (s) => toTitleCase(s) },
    ];
    for (const { pattern, fn } of functionCalls) {
        result = result.replace(pattern, (match, p1) => {
            const value = context[p1];
            return typeof value === 'string' ? fn(value) : String(value ?? '');
        });
    }
    // Second pass: handle variable substitution ${var}
    for (const [key, value] of Object.entries(context)) {
        result = result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), String(value));
    }
    return result;
}
function pascalCase(str) {
    return str
        .split(/[-_]/g)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
}
function kebabCase(str) {
    return str
        .split(/[-_]/g)
        .map((word) => word.toLowerCase())
        .join('-');
}
function camelCase(str) {
    return str
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase())
        .replace(/ /g, '');
}
function toTitleCase(str) {
    return str
        .split(/[-_]/g)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}
/**
 * Load a template from a file path.
 */
export async function loadTemplate(templatePath) {
    const fs = await import('node:fs/promises');
    return await fs.readFile(templatePath, 'utf-8');
}
/**
 * Render a template with the given context.
 */
export function renderTemplate(template, context) {
    // Apply function transformations
    let result = template;
    result = result.replace(/\$pascalCase\((\w+)\)/g, (_, p1) => pascalCase(p1));
    result = result.replace(/\$kebabCase\((\w+)\)/g, (_, p1) => kebabCase(p1));
    result = result.replace(/\$camelCase\((\w+)\)/g, (_, p1) => camelCase(p1));
    result = result.replace(/\$templateName\((\w+)\)/g, (_, p1) => toTitleCase(p1));
    // Handle context variables
    for (const [key, value] of Object.entries(context)) {
        result = result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), String(value));
    }
    return result;
}
/**
 * Generate multiple files from a generator definition.
 */
export function generateFromTemplate(generator, context) {
    return generator.files.map((file) => ({
        ...file,
        path: renderTemplate(file.path, context),
        content: renderTemplate(file.content, context),
    }));
}
