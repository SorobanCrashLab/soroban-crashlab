import * as assert from 'node:assert/strict';
import { crc32, createZipArchive, readZipArchive, type ZipEntry } from './zip-writer';

const FIXED_DATE = new Date(Date.UTC(2026, 2, 1, 8, 0, 0));

function bytesOf(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

// ---------------------------------------------------------------------------
// crc32
// ---------------------------------------------------------------------------

function testCrc32KnownVectors(): void {
    // Published CRC-32/ISO-HDLC check values.
    assert.equal(crc32(bytesOf('')), 0x00000000);
    assert.equal(crc32(bytesOf('123456789')), 0xcbf43926);
    assert.equal(crc32(bytesOf('The quick brown fox jumps over the lazy dog')), 0x414fa339);
}

function testCrc32IsUnsigned(): void {
    // A naive implementation returns a negative number here.
    assert.ok(crc32(bytesOf('a')) > 0);
}

// ---------------------------------------------------------------------------
// Archive structure
// ---------------------------------------------------------------------------

function testArchiveStartsWithLocalFileHeaderSignature(): void {
    const zip = createZipArchive([{ path: 'a.txt', content: 'hello' }], { modifiedAt: FIXED_DATE });
    // "PK\x03\x04" — what every unzip tool checks first.
    assert.deepEqual([...zip.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
}

function testEmptyArchiveIsJustAnEocdRecord(): void {
    const zip = createZipArchive([], { modifiedAt: FIXED_DATE });
    assert.equal(zip.length, 22);
    assert.deepEqual([...zip.subarray(0, 4)], [0x50, 0x4b, 0x05, 0x06]);
    assert.deepEqual(readZipArchive(zip), []);
}

function testDuplicatePathsAreRejected(): void {
    assert.throws(
        () =>
            createZipArchive([
                { path: 'dup.json', content: '1' },
                { path: 'dup.json', content: '2' },
            ]),
        /Duplicate entry path/,
    );
}

function testUnsafePathsAreRejected(): void {
    for (const path of ['../outside.txt', 'nested/../../outside.txt', '/absolute.txt', 'C:/outside.txt', 'nested\\outside.txt']) {
        assert.throws(() => createZipArchive([{ path, content: 'unsafe' }]), /Invalid ZIP entry path|unsafe segment/);
    }
}

function testEntryAndArchiveSizeLimitsAreEnforced(): void {
    assert.throws(
        () => createZipArchive([{ path: 'large.txt', content: 'x'.repeat(4 * 1024 * 1024 + 1) }]),
        /entry exceeds/,
    );
    assert.throws(
        () => readZipArchive(new Uint8Array(17 * 1024 * 1024)),
        /archive exceeds/,
    );
}

function testOutputIsDeterministicForAFixedDate(): void {
    const entries: ZipEntry[] = [{ path: 'a.txt', content: 'hello' }];
    const first = createZipArchive(entries, { modifiedAt: FIXED_DATE });
    const second = createZipArchive(entries, { modifiedAt: FIXED_DATE });
    assert.deepEqual([...first], [...second]);
}

// ---------------------------------------------------------------------------
// Round trip
// ---------------------------------------------------------------------------

function testRoundTripSingleEntry(): void {
    const zip = createZipArchive([{ path: 'manifest.json', content: '{"a":1}' }], {
        modifiedAt: FIXED_DATE,
    });
    assert.deepEqual(readZipArchive(zip), [{ path: 'manifest.json', content: '{"a":1}' }]);
}

function testRoundTripMultipleEntriesPreservesOrder(): void {
    const entries: ZipEntry[] = [
        { path: 'manifest.json', content: '{"version":"1.0"}' },
        { path: 'runs/run-1/metadata.json', content: '{"id":"run-1"}' },
        { path: 'README.md', content: '# Bundle\n' },
    ];
    assert.deepEqual(readZipArchive(createZipArchive(entries, { modifiedAt: FIXED_DATE })), entries);
}

function testRoundTripEmptyFile(): void {
    const zip = createZipArchive([{ path: 'empty.txt', content: '' }], { modifiedAt: FIXED_DATE });
    assert.deepEqual(readZipArchive(zip), [{ path: 'empty.txt', content: '' }]);
}

function testRoundTripUnicodeContentAndPaths(): void {
    const entries: ZipEntry[] = [{ path: 'notes/ünïcode-✅.md', content: '# Résumé — 日本語\n' }];
    assert.deepEqual(readZipArchive(createZipArchive(entries, { modifiedAt: FIXED_DATE })), entries);
}

function testRoundTripLargeEntry(): void {
    const content = 'x'.repeat(200_000);
    const zip = createZipArchive([{ path: 'big.txt', content }], { modifiedAt: FIXED_DATE });
    assert.equal(readZipArchive(zip)[0].content, content);
}

// ---------------------------------------------------------------------------
// Reader validation
// ---------------------------------------------------------------------------

function testReaderRejectsNonZipInput(): void {
    assert.throws(() => readZipArchive(bytesOf('this is not a zip file at all, truly')), /Not a ZIP archive/);
}

function testReaderDetectsCorruptedData(): void {
    const zip = createZipArchive([{ path: 'a.txt', content: 'hello world' }], {
        modifiedAt: FIXED_DATE,
    });
    // Flip a byte inside the stored payload; the CRC in the header no longer matches.
    const corrupted = Uint8Array.from(zip);
    corrupted[30 + 'a.txt'.length] ^= 0xff;
    assert.throws(() => readZipArchive(corrupted), /CRC mismatch/);
}

// ---------------------------------------------------------------------------
// Run all
// ---------------------------------------------------------------------------

testCrc32KnownVectors();
testCrc32IsUnsigned();

testArchiveStartsWithLocalFileHeaderSignature();
testEmptyArchiveIsJustAnEocdRecord();
testDuplicatePathsAreRejected();
testUnsafePathsAreRejected();
testEntryAndArchiveSizeLimitsAreEnforced();
testOutputIsDeterministicForAFixedDate();

testRoundTripSingleEntry();
testRoundTripMultipleEntriesPreservesOrder();
testRoundTripEmptyFile();
testRoundTripUnicodeContentAndPaths();
testRoundTripLargeEntry();

testReaderRejectsNonZipInput();
testReaderDetectsCorruptedData();

console.log('zip-writer.test.ts: all assertions passed');
