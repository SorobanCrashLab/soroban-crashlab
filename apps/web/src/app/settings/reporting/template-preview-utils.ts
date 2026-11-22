import { slugify } from '../../utils/string';

/**
 * Pure helpers backing the Markdown preview for reporting templates (#1118).
 *
 * Everything in this module is DOM-free so it can be unit-tested with plain
 * Node, matching the `npm test` harness used elsewhere in this app.
 */

/** How the template editor splits its space between source and preview. */
export type PreviewMode = 'edit' | 'preview' | 'split';

/** Order used when cycling modes from the keyboard. */
export const PREVIEW_MODES: readonly PreviewMode[] = ['edit', 'preview', 'split'];

/**
 * Preview rendering is capped so a runaway template cannot lock up the main
 * thread inside react-markdown. Templates are hand-written, so this ceiling is
 * far above any realistic report.
 */
export const MAX_PREVIEW_CHARACTERS = 50_000;

/**
 * A placeholder an author can drop into a template body. The preview swaps
 * these for `sample` so the rendered output reads like a real report instead of
 * a form full of braces.
 */
export interface TemplateVariable {
    /** Bare token name, without the surrounding braces. */
    token: string;
    /** Human label shown in the variable legend. */
    label: string;
    /** Value substituted while previewing with sample data. */
    sample: string;
}

export const TEMPLATE_VARIABLES: readonly TemplateVariable[] = [
    { token: 'run_id', label: 'Run ID', sample: 'run-1017' },
    { token: 'run_status', label: 'Status', sample: 'failed' },
    { token: 'run_area', label: 'Area', sample: 'state' },
    { token: 'run_severity', label: 'Severity', sample: 'critical' },
    { token: 'failure_category', label: 'Failure category', sample: 'Panic' },
    { token: 'signature', label: 'Signature', sample: 'sig:vault:rebalance:unwrap_budget_snapshot' },
    { token: 'replay_command', label: 'Replay command', sample: 'cargo run --bin crash-replay -- --run-id run-1017' },
    { token: 'generated_at', label: 'Generated at', sample: '2026-03-01T08:00:00.000Z' },
];

/** Matches `{{token}}` with optional inner padding, e.g. `{{ run_id }}`. */
const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/** Opening or closing fence of a code block (``` or ~~~, optionally indented). */
const FENCE_PATTERN = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * Returns every distinct placeholder token used in `body`, in first-seen order.
 * Tokens keep their bare form (`run_id`), not the braced form.
 */
export function extractPlaceholders(body: string): string[] {
    const seen = new Set<string>();
    for (const match of body.matchAll(PLACEHOLDER_PATTERN)) {
        seen.add(match[1]);
    }
    return [...seen];
}

/**
 * Substitutes `{{token}}` placeholders with the supplied values.
 *
 * Tokens with no matching entry are deliberately left untouched: a typo stays
 * visible in the preview rather than silently rendering as an empty string.
 */
export function applyTemplateVariables(
    body: string,
    values: Readonly<Record<string, string>>,
): string {
    return body.replace(PLACEHOLDER_PATTERN, (original, token: string) =>
        Object.prototype.hasOwnProperty.call(values, token) ? values[token] : original,
    );
}

/** Sample values keyed by token, derived from {@link TEMPLATE_VARIABLES}. */
export function buildSampleValues(): Record<string, string> {
    const values: Record<string, string> = {};
    for (const variable of TEMPLATE_VARIABLES) {
        values[variable.token] = variable.sample;
    }
    return values;
}

/** One ATX heading (`#`…`######`) found outside of a fenced code block. */
export interface TemplateHeading {
    /** Number of leading `#` characters (1–6). */
    depth: number;
    /** Heading text with the leading hashes and surrounding space removed. */
    text: string;
}

/**
 * Extracts the ATX headings that make up a template's outline.
 * Headings inside fenced code blocks are ignored — a `# comment` in a bash
 * snippet is not a section title.
 */
export function extractHeadings(body: string): TemplateHeading[] {
    const headings: TemplateHeading[] = [];
    let insideFence = false;

    for (const line of body.split('\n')) {
        if (FENCE_PATTERN.test(line)) {
            insideFence = !insideFence;
            continue;
        }
        if (insideFence) continue;

        const match = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line);
        if (match) {
            headings.push({ depth: match[1].length, text: match[2].trim() });
        }
    }

    return headings;
}

/** Counts that give an author a feel for a template's shape at a glance. */
export interface MarkdownSummary {
    headings: number;
    checklistItems: number;
    codeBlocks: number;
    links: number;
    words: number;
    characters: number;
}

/**
 * Summarises a template body. Counts are approximate by design — they exist to
 * orient the author, not to drive behaviour.
 */
export function summarizeMarkdown(body: string): MarkdownSummary {
    let checklistItems = 0;
    let fences = 0;
    let insideFence = false;

    for (const line of body.split('\n')) {
        if (FENCE_PATTERN.test(line)) {
            fences += 1;
            insideFence = !insideFence;
            continue;
        }
        if (insideFence) continue;

        if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) {
            checklistItems += 1;
        }
    }

    const words = body.trim() === '' ? 0 : body.trim().split(/\s+/).length;

    return {
        headings: extractHeadings(body).length,
        checklistItems,
        // Two fences make one block; an unbalanced trailing fence still opens one.
        codeBlocks: Math.ceil(fences / 2),
        links: [...body.matchAll(/\[[^\]]*\]\([^)]*\)/g)].length,
        words,
        characters: body.length,
    };
}

/** Outcome of checking whether a body can be handed to the renderer. */
export type TemplateBodyStatus = 'empty' | 'ok' | 'too-large';

export interface TemplateBodyValidation {
    status: TemplateBodyStatus;
    /** User-facing explanation. Empty string when the body renders normally. */
    message: string;
}

/**
 * Decides whether a template body should render, show an empty state, or be
 * refused as too large for the preview.
 */
export function validateTemplateBody(body: string): TemplateBodyValidation {
    if (body.trim() === '') {
        return {
            status: 'empty',
            message: 'Nothing to preview yet — add some Markdown to the template body.',
        };
    }

    if (body.length > MAX_PREVIEW_CHARACTERS) {
        return {
            status: 'too-large',
            message: `Template is ${body.length.toLocaleString()} characters, above the ${MAX_PREVIEW_CHARACTERS.toLocaleString()} character preview limit. Shorten it to preview.`,
        };
    }

    return { status: 'ok', message: '' };
}

/**
 * Produces the exact Markdown the preview pane renders: sample values applied
 * when requested, otherwise the raw body.
 */
export function buildPreviewSource(body: string, useSampleValues: boolean): string {
    return useSampleValues ? applyTemplateVariables(body, buildSampleValues()) : body;
}

/** Next mode in the {@link PREVIEW_MODES} cycle, wrapping at the end. */
export function cyclePreviewMode(mode: PreviewMode): PreviewMode {
    const index = PREVIEW_MODES.indexOf(mode);
    return PREVIEW_MODES[(index + 1) % PREVIEW_MODES.length];
}

/** Filename used when an author downloads a template as a `.md` file. */
export function buildTemplateFilename(name: string): string {
    const slug = slugify(name);
    return `${slug || 'template'}.md`;
}
