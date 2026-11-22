import {
  detectContentType,
  formatJsonContent,
  formatHexDump,
  decodeContent,
} from "./artifact-content-utils";

// Test utilities
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function strToBuffer(str: string): ArrayBuffer {
  return new TextEncoder().encode(str).buffer;
}

// Test: detectContentType detects JSON
function testDetectContentTypeJson(): void {
  const jsonBuffer = strToBuffer('{"name":"test","value":42}');
  const result = detectContentType(jsonBuffer);
  assert(result === "json", `Expected json but got ${result}`);

  const jsonArrayBuffer = strToBuffer('[1,2,3]');
  const result2 = detectContentType(jsonArrayBuffer);
  assert(result2 === "json", `Expected json but got ${result2}`);

  const jsonNested = strToBuffer('{"a":{"b":[1,2,3]}}');
  const result3 = detectContentType(jsonNested);
  assert(result3 === "json", `Expected json but got ${result3}`);

  console.log("✓ testDetectContentTypeJson passed");
}

// Test: detectContentType detects text
function testDetectContentTypeText(): void {
  const textBuffer = strToBuffer("Hello, World!\nThis is plain text.");
  const result = detectContentType(textBuffer);
  assert(result === "text", `Expected text but got ${result}`);

  const logBuffer = strToBuffer("2026-04-23 [INFO] Fuzzer started\n2026-04-23 [DEBUG] Processing...");
  const result2 = detectContentType(logBuffer);
  assert(result2 === "text", `Expected text but got ${result2}`);

  const emptyBuffer = strToBuffer("");
  const result3 = detectContentType(emptyBuffer);
  assert(result3 === "text", `Expected text but got ${result3}`);

  console.log("✓ testDetectContentTypeText passed");
}

// Test: detectContentType detects hex/binary
function testDetectContentTypeHex(): void {
  // Binary data (non-text bytes)
  const binaryBuffer = new Uint8Array([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD, 0x00, 0x1A]).buffer;
  const result = detectContentType(binaryBuffer);
  assert(result === "hex", `Expected hex but got ${result}`);

  // Invalid JSON that starts with { should be treated as binary
  const invalidJson = new Uint8Array([0x7b, 0x00, 0x00, 0x00]).buffer; // '{' followed by null bytes
  const result2 = detectContentType(invalidJson);
  assert(result2 === "hex", `Expected hex but got ${result2}`);

  console.log("✓ testDetectContentTypeHex passed");
}

// Test: formatJsonContent formats and pretty-prints JSON
function testFormatJsonContent(): void {
  const input = '{"name":"test","value":42,"nested":{"a":true}}';
  const formatted = formatJsonContent(input);
  
  // Should be formatted with indentation
  assert(formatted.includes("\n"), "Formatted JSON should contain newlines");
  assert(formatted.includes("  "), "Formatted JSON should be indented");
  
  // Should be valid JSON
  const parsed = JSON.parse(formatted);
  assert(parsed.name === "test", `Expected name to be 'test' but got ${parsed.name}`);
  assert(parsed.value === 42, `Expected value to be 42 but got ${parsed.value}`);
  assert(parsed.nested.a === true, "Expected nested.a to be true");

  // Invalid JSON should return original string
  const invalidInput = "not valid json";
  const result = formatJsonContent(invalidInput);
  assert(result === invalidInput, "Invalid JSON should return original string");

  console.log("✓ testFormatJsonContent passed");
}

// Test: formatHexDump produces correct hex dump output
function testFormatHexDump(): void {
  const buffer = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x00, 0x01, 0x02]).buffer;
  const dump = formatHexDump(buffer);
  
  // Should include hex addresses
  assert(dump.includes("00000000"), "Hex dump should start with address 00000000");
  
  // Should include hex bytes
  assert(dump.includes("48"), "Hex dump should contain byte 48");
  assert(dump.includes("65"), "Hex dump should contain byte 65");
  assert(dump.includes("6C"), "Hex dump should contain byte 6C");
  assert(dump.includes("6F"), "Hex dump should contain byte 6F");
  
  // Should include ASCII representation
  assert(dump.includes("|"), "Hex dump should include ASCII column");
  assert(dump.includes("Hello"), "Hex dump should show 'Hello' in ASCII column");

  // Empty buffer
  const emptyDump = formatHexDump(new ArrayBuffer(0));
  assert(emptyDump === "", "Empty buffer should produce empty hex dump");

  console.log("✓ testFormatHexDump passed");
}

// Test: formatHexDump truncation with maxBytes
function testFormatHexDumpTruncation(): void {
  // Create a buffer with 100 bytes
  const buffer = new Uint8Array(100).buffer;
  
  // With maxBytes=32, should show truncation indicator
  const dump = formatHexDump(buffer, 32);
  assert(dump.includes("..."), "Truncated hex dump should show ellipsis");
  assert(dump.includes("more bytes"), "Truncated hex dump should indicate remaining bytes");
  
  console.log("✓ testFormatHexDumpTruncation passed");
}

// Test: decodeContent decodes ArrayBuffer to string
function testDecodeContent(): void {
  const encoder = new TextEncoder();
  const buffer = encoder.encode("Hello, World!").buffer;
  const decoded = decodeContent(buffer);
  assert(decoded === "Hello, World!", `Expected 'Hello, World!' but got '${decoded}'`);

  const emptyBuffer = new ArrayBuffer(0);
  const emptyDecoded = decodeContent(emptyBuffer);
  assert(emptyDecoded === "", "Empty buffer should decode to empty string");

  console.log("✓ testDecodeContent passed");
}

// Run all tests
function runAllTests(): void {
  console.log("Running Artifact Content Utils Tests...\n");

  try {
    testDetectContentTypeJson();
    testDetectContentTypeText();
    testDetectContentTypeHex();
    testFormatJsonContent();
    testFormatHexDump();
    testFormatHexDumpTruncation();
    testDecodeContent();

    console.log("\n✅ All Artifact Content Utils tests passed!");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

export {
  detectContentType,
  formatJsonContent,
  formatHexDump,
  decodeContent,
  runAllTests,
};

// Run tests if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
  runAllTests();
}
