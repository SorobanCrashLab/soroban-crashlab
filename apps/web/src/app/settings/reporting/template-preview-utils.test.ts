import * as assert from 'node:assert/strict';
import {
    MAX_PREVIEW_CHARACTERS,
    PREVIEW_MODES,
    TEMPLATE_VARIABLES,
    applyTemplateVariables,
    buildPreviewSource,
    buildSampleValues,
    buildTemplateFilename,
    cyclePreviewMode,
    extractHeadings,
    extractPlaceholders,
    summarizeMarkdown,
    validateTemplateBody,
} from './template-preview-utils';

// ---------------------------------------------------------------------------
// extractPlaceholders
// ---------------------------------------------------------------------------

function testExtractPlaceholdersFindsTokens(): void {
    assert.deepEqual(
        extractPlaceholders('Run {{run_id}} failed with {{failure_category}}.'),
        ['run_id', 'failure_category'],
    );
}

function testExtractPlaceholdersDeduplicatesInOrder(): void {
    assert.deepEqual(
        extractPlaceholders('{{b}} {{a}} {{b}}'),
        ['b', 'a'],
    );
}

function testExtractPlaceholdersAllowsInnerPadding(): void {
    assert.deepEqual(extractPlaceholders('{{  run_id  }}'), ['run_id']);
}

function testExtractPlaceholdersEmptyBody(): void {
    assert.deepEqual(extractPlaceholders(''), []);
}

function testExtractPlaceholdersIgnoresSingleBraces(): void {
    assert.deepEqual(extractPlaceholders('{run_id} and { {run_id} }'), []);
}

// ---------------------------------------------------------------------------
// applyTemplateVariables
// ---------------------------------------------------------------------------

function testApplyTemplateVariablesSubstitutes(): void {
    assert.equal(
        applyTemplateVariables('Run {{run_id}}', { run_id: 'run-1017' }),
        'Run run-1017',
    );
}

function testApplyTemplateVariablesLeavesUnknownTokens(): void {
    assert.equal(
        applyTemplateVariables('{{run_id}} / {{mystery}}', { run_id: 'run-1' }),
        'run-1 / {{mystery}}',
    );
}

function testApplyTemplateVariablesReplacesEveryOccurrence(): void {
    assert.equal(
        applyTemplateVariables('{{a}}-{{a}}-{{a}}', { a: 'x' }),
        'x-x-x',
    );
}

function testApplyTemplateVariablesHandlesPadding(): void {
    assert.equal(applyTemplateVariables('{{ a }}', { a: 'x' }), 'x');
}

function testApplyTemplateVariablesIgnoresInheritedKeys(): void {
    // `toString` lives on Object.prototype; it must not be treated as a value.
    assert.equal(applyTemplateVariables('{{toString}}', {}), '{{toString}}');
}

// ---------------------------------------------------------------------------
// buildSampleValues / buildPreviewSource
// ---------------------------------------------------------------------------

function testBuildSampleValuesCoversEveryVariable(): void {
    const values = buildSampleValues();
    for (const variable of TEMPLATE_VARIABLES) {
        assert.equal(values[variable.token], variable.sample);
    }
    assert.equal(Object.keys(values).length, TEMPLATE_VARIABLES.length);
}

function testBuildPreviewSourceWithSamples(): void {
    assert.equal(buildPreviewSource('Run {{run_id}}', true), 'Run run-1017');
}

function testBuildPreviewSourceWithoutSamples(): void {
    assert.equal(buildPreviewSource('Run {{run_id}}', false), 'Run {{run_id}}');
}

// ---------------------------------------------------------------------------
// extractHeadings
// ---------------------------------------------------------------------------

function testExtractHeadingsReadsDepthAndText(): void {
    assert.deepEqual(extractHeadings('# Title\n\n## Section\n\n### Detail'), [
        { depth: 1, text: 'Title' },
        { depth: 2, text: 'Section' },
        { depth: 3, text: 'Detail' },
    ]);
}

function testExtractHeadingsSkipsFencedCode(): void {
    const body = '# Real\n\n```bash\n# not a heading\n```\n\n## Also real';
    assert.deepEqual(extractHeadings(body), [
        { depth: 1, text: 'Real' },
        { depth: 2, text: 'Also real' },
    ]);
}

function testExtractHeadingsSkipsTildeFencedCode(): void {
    const body = '~~~\n# hidden\n~~~\n# visible';
    assert.deepEqual(extractHeadings(body), [{ depth: 1, text: 'visible' }]);
}

function testExtractHeadingsRequiresSpaceAfterHashes(): void {
    assert.deepEqual(extractHeadings('#NoSpace'), []);
}

function testExtractHeadingsEmptyBody(): void {
    assert.deepEqual(extractHeadings(''), []);
}

// ---------------------------------------------------------------------------
// summarizeMarkdown
// ---------------------------------------------------------------------------

function testSummarizeMarkdownCountsStructure(): void {
    const body = [
        '# Crash Report',
        '',
        '## Verification',
        '- [ ] Reproduced',
        '- [x] Fixed',
        '- plain bullet',
        '',
        'See [the issue](https://example.com/1).',
        '',
        '```bash',
        'cargo test',
        '```',
    ].join('\n');

    const summary = summarizeMarkdown(body);
    assert.equal(summary.headings, 2);
    assert.equal(summary.checklistItems, 2);
    assert.equal(summary.codeBlocks, 1);
    assert.equal(summary.links, 1);
    assert.equal(summary.characters, body.length);
    assert.ok(summary.words > 0);
}

function testSummarizeMarkdownIgnoresChecklistInsideCode(): void {
    const body = '```\n- [ ] not counted\n```';
    assert.equal(summarizeMarkdown(body).checklistItems, 0);
}

function testSummarizeMarkdownEmptyBody(): void {
    assert.deepEqual(summarizeMarkdown(''), {
        headings: 0,
        checklistItems: 0,
        codeBlocks: 0,
        links: 0,
        words: 0,
        characters: 0,
    });
}

function testSummarizeMarkdownWhitespaceOnlyBodyHasNoWords(): void {
    assert.equal(summarizeMarkdown('   \n  \n').words, 0);
}

function testSummarizeMarkdownCountsUnbalancedFenceAsOneBlock(): void {
    assert.equal(summarizeMarkdown('```bash\ncargo test').codeBlocks, 1);
}

// ---------------------------------------------------------------------------
// validateTemplateBody
// ---------------------------------------------------------------------------

function testValidateTemplateBodyEmpty(): void {
    const result = validateTemplateBody('   \n  ');
    assert.equal(result.status, 'empty');
    assert.ok(result.message.length > 0);
}

function testValidateTemplateBodyOk(): void {
    assert.deepEqual(validateTemplateBody('# Hello'), { status: 'ok', message: '' });
}

function testValidateTemplateBodyTooLarge(): void {
    const result = validateTemplateBody('x'.repeat(MAX_PREVIEW_CHARACTERS + 1));
    assert.equal(result.status, 'too-large');
    assert.ok(result.message.includes('preview limit'));
}

function testValidateTemplateBodyAtLimitIsOk(): void {
    assert.equal(validateTemplateBody('x'.repeat(MAX_PREVIEW_CHARACTERS)).status, 'ok');
}

// ---------------------------------------------------------------------------
// cyclePreviewMode
// ---------------------------------------------------------------------------

function testCyclePreviewModeWraps(): void {
    assert.equal(cyclePreviewMode('edit'), 'preview');
    assert.equal(cyclePreviewMode('preview'), 'split');
    assert.equal(cyclePreviewMode('split'), 'edit');
}

function testPreviewModesAreUnique(): void {
    assert.equal(new Set(PREVIEW_MODES).size, PREVIEW_MODES.length);
}

// ---------------------------------------------------------------------------
// buildTemplateFilename
// ---------------------------------------------------------------------------

function testBuildTemplateFilenameSlugifies(): void {
    assert.equal(buildTemplateFilename('Issue: Run Crash Report'), 'issue-run-crash-report.md');
}

function testBuildTemplateFilenameTrimsSeparators(): void {
    assert.equal(buildTemplateFilename('  ***Draft***  '), 'draft.md');
}

function testBuildTemplateFilenameFallsBack(): void {
    assert.equal(buildTemplateFilename('***'), 'template.md');
    assert.equal(buildTemplateFilename(''), 'template.md');
}

// ---------------------------------------------------------------------------
// Run all
// ---------------------------------------------------------------------------

testExtractPlaceholdersFindsTokens();
testExtractPlaceholdersDeduplicatesInOrder();
testExtractPlaceholdersAllowsInnerPadding();
testExtractPlaceholdersEmptyBody();
testExtractPlaceholdersIgnoresSingleBraces();

testApplyTemplateVariablesSubstitutes();
testApplyTemplateVariablesLeavesUnknownTokens();
testApplyTemplateVariablesReplacesEveryOccurrence();
testApplyTemplateVariablesHandlesPadding();
testApplyTemplateVariablesIgnoresInheritedKeys();

testBuildSampleValuesCoversEveryVariable();
testBuildPreviewSourceWithSamples();
testBuildPreviewSourceWithoutSamples();

testExtractHeadingsReadsDepthAndText();
testExtractHeadingsSkipsFencedCode();
testExtractHeadingsSkipsTildeFencedCode();
testExtractHeadingsRequiresSpaceAfterHashes();
testExtractHeadingsEmptyBody();

testSummarizeMarkdownCountsStructure();
testSummarizeMarkdownIgnoresChecklistInsideCode();
testSummarizeMarkdownEmptyBody();
testSummarizeMarkdownWhitespaceOnlyBodyHasNoWords();
testSummarizeMarkdownCountsUnbalancedFenceAsOneBlock();

testValidateTemplateBodyEmpty();
testValidateTemplateBodyOk();
testValidateTemplateBodyTooLarge();
testValidateTemplateBodyAtLimitIsOk();

testCyclePreviewModeWraps();
testPreviewModesAreUnique();

testBuildTemplateFilenameSlugifies();
testBuildTemplateFilenameTrimsSeparators();
testBuildTemplateFilenameFallsBack();

console.log('template-preview-utils.test.ts: all assertions passed');
