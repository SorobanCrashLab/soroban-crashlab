/**
 * Simple template engine for code generation.
 * Supports variable substitution and basic control structures.
 */

type TemplateContext = Record<string, string | number | boolean>;

export function template(str: string, context: TemplateContext): string;
export function template(strings: TemplateStringsArray, ...keys: string[]): string;
export function template(arg: string | TemplateStringsArray, ...args: (string | TemplateContext)[]): string {
  let str: string;
  let context: TemplateContext;
  
  if (typeof arg === 'string') {
    str = arg;
    context = (args[0] ?? {}) as TemplateContext;
  } else {
    str = arg.join('');
    context = {};
    args.forEach((arg, i) => {
      if (typeof arg === 'object') {
        Object.assign(context, arg as TemplateContext);
      } else {
        context[`${i}`] = arg as string;
      }
    });
  }
  
  let result = str;
  
  // First pass: handle function calls
  const functionCalls = [
    { pattern: /\$pascalCase\((\w+)\)/g, fn: (s: string) => pascalCase(s) },
    { pattern: /\$kebabCase\((\w+)\)/g, fn: (s: string) => kebabCase(s) },
    { pattern: /\$camelCase\((\w+)\)/g, fn: (s: string) => camelCase(s) },
    { pattern: /\$templateName\((\w+)\)/g, fn: (s: string) => toTitleCase(s) },
  ];
  
  for (const { pattern, fn } of functionCalls) {
    result = result.replace(pattern, (match: string, p1: string) => {
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

function pascalCase(str: string): string {
  return str
    .split(/[-_]/g)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function kebabCase(str: string): string {
  return str
    .split(/[-_]/g)
    .map((word) => word.toLowerCase())
    .join('-');
}

function camelCase(str: string): string {
  return str
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .replace(/ /g, '');
}

function toTitleCase(str: string): string {
  return str
    .split(/[-_]/g)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export interface TemplateFile {
  path: string;
  content: string;
}

export interface TemplateGenerator {
  name: string;
  description: string;
  files: TemplateFile[];
}

/**
 * Load a template from a file path.
 */
export async function loadTemplate(templatePath: string): Promise<string> {
  const fs = await import('node:fs/promises');
  return await fs.readFile(templatePath, 'utf-8');
}

/**
 * Render a template with the given context.
 */
export function renderTemplate(template: string, context: TemplateContext): string {
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
export function generateFromTemplate(generator: TemplateGenerator, context: TemplateContext): TemplateFile[] {
  return generator.files.map((file) => ({
    ...file,
    path: renderTemplate(file.path, context),
    content: renderTemplate(file.content, context),
  }));
}