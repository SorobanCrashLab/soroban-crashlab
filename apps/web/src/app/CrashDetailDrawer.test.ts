const fs = require('fs');
const path = require('path');

/**
 * Static analysis test for CrashDetailDrawer.tsx
 * Verifies that the component contains the required replay logic and UI elements.
 */

function testDrawerImplementation() {
    const filePath = path.join(__dirname, 'CrashDetailDrawer.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    const assertions = [
        {
            name: 'Uses ReplayButtonStatus for status management',
            pattern: /status, setStatus.*ReplayButtonStatus/,
        },
        {
            name: 'Checks for maintainer mode before triggering replay',
            pattern: /if \(.*!isMaintainer.*\)\s*return/,
        },
        {
            name: 'Displays "Running replay…" when loading',
            pattern: /status === 'loading' \? 'Running replay…'/,
        },
        {
            name: 'Shows success message with link to new run',
            pattern: /Replay triggered successfully!/,
        },
        {
            name: 'Shows error message when replay fails',
            pattern: /Replay failed to start/,
        },
        {
            name: 'Provides link to new run ID',
            pattern: /href=\{`\/\?run=\$\{replayedRunId\}`\}/,
        },
        {
            name: 'Includes maintainer mode restriction help text',
            pattern: /Enable maintainer mode to trigger replays/,
        },
        {
            name: 'Uses accessible aria attributes',
            pattern: /aria-live="polite"/,
        }
    ];

    console.log('--- CrashDetailDrawer Static Analysis Tests ---');
    let passedCount = 0;

    assertions.forEach(assertion => {
        if (assertion.pattern.test(content)) {
            console.log(`[PASS] ${assertion.name}`);
            passedCount++;
        } else {
            console.error(`[FAIL] ${assertion.name}`);
            console.error(`       Expected pattern: ${assertion.pattern}`);
        }
    });

    console.log(`\nResult: ${passedCount}/${assertions.length} tests passed.`);

    if (passedCount < assertions.length) {
        process.exit(1);
    }
}

testDrawerImplementation();
