import * as assert from "node:assert/strict";
import {
  escapeLabelValue,
  truncateLabelValue,
  sanitizeLabelValue,
  serializeLabel,
  isAllowedLabelName,
  MAX_LABEL_VALUE_LENGTH,
  TRUNCATION_MARKER,
} from "./prometheus-adapter";

const TRUNCATION_MARKER_LENGTH = TRUNCATION_MARKER.length;

/** Returns true when `value` contains a double quote NOT escaped by a backslash. */
function hasUnescapedQuote(value: string): boolean {
  let escaped = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      return true;
    }
  }
  return escaped; // trailing lone backslash is also invalid
}

const runAssertions = () => {
  // Escape matrix: backslash, double quote, newline (and friends).
  assert.equal(escapeLabelValue("plain"), "plain");
  assert.equal(escapeLabelValue('a"b'), 'a\\"b');
  assert.equal(escapeLabelValue("a\\b"), "a\\\\b");
  assert.equal(escapeLabelValue("line1\nline2"), "line1\\nline2");
  assert.equal(escapeLabelValue("tab\there"), "tab\\there");
  assert.equal(escapeLabelValue("cr\r"), "cr\\r");
  // Backslash escaped first, so inserted escapes are not re-escaped.
  assert.equal(escapeLabelValue('a\\"b'), 'a\\\\\\"b');
  assert.equal(escapeLabelValue('both\\"and\nnl'), 'both\\\\\\"and\\nnl');

  // Truncation.
  assert.equal(truncateLabelValue("short"), "short");
  const long = "x".repeat(MAX_LABEL_VALUE_LENGTH);
  assert.equal(truncateLabelValue(long), long);
  const tooLong = "y".repeat(MAX_LABEL_VALUE_LENGTH + 50);
  const truncated = truncateLabelValue(tooLong);
  assert.equal(truncated.length, MAX_LABEL_VALUE_LENGTH, "truncated value is bounded");
  assert.ok(truncated.endsWith(TRUNCATION_MARKER), "truncated value carries the marker");

  // Truncation does not split the escape/marker: keep must be at least marker + 1.
  assert.ok(MAX_LABEL_VALUE_LENGTH > TRUNCATION_MARKER_LENGTH);

  // Composed sanitization keeps hostile values parseable, single-line, bounded.
  const hostile = 'ev\\il"run\nname\twith a very long tail ' + "z".repeat(300);
  const sanitized = sanitizeLabelValue(hostile);
  assert.ok(!hasUnescapedQuote(sanitized), "no unescaped double quote leaks into the value");
  assert.ok(!sanitized.includes("\n"), "no raw newline leaks into the value");
  assert.ok(sanitized.length <= MAX_LABEL_VALUE_LENGTH, "sanitized value is bounded");

  // Label name whitelist.
  assert.equal(isAllowedLabelName("run_name"), true);
  assert.equal(isAllowedLabelName("campaign"), true);
  assert.equal(isAllowedLabelName("arbitrary_user_field"), false);

  // serializeLabel: allowed names serialize sanitized values.
  assert.equal(serializeLabel("run_name", 'evil"name'), 'run_name="evil\\"name"');
  // Disallowed names are skipped (null), so they can never corrupt the batch.
  assert.equal(serializeLabel("not_allowed", "x"), null);
  // Empty values skipped.
  assert.equal(serializeLabel("run_name", ""), null);

  // Composed hostile-batch: every label value sanitized, no invalid vectors remain.
  const hostileRunNames = ['ok', 'back\\slash', 'double"quote', 'new\nline', "tab\tsep"];
  for (const name of hostileRunNames) {
    const pair = serializeLabel("run_name", name);
    assert.ok(pair, "hostile run name still serialized for allowed label");
    const value = pair!.slice(pair!.indexOf("=") + 2, -1); // strip `name="` and trailing `"`
    assert.ok(!hasUnescapedQuote(value), `no unescaped quote for ${JSON.stringify(name)}`);
    assert.ok(!value.includes("\n"), `no raw newline for ${JSON.stringify(name)}`);
  }
};

runAssertions();
console.log("prometheus-adapter test: all assertions passed");
