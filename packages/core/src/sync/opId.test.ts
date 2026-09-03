/**
 * FILE: packages/core/src/sync/opId.test.ts
 * PLAN: IMPLEMENTATION_PLAN.md §10.2
 * STATUS: COMPLETE — do not modify. Make the code satisfy the test.
 * PHASE: 3
 *
 * Canonicalisation is what lets the server tell "this is a retry of the same
 * write" apart from "someone reused an operation id with different content".
 * Get it wrong and either duplicate visits appear, or legitimate retries are
 * rejected as tampering.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { canonicalize, isUuidV4, payloadFingerprint } from "./opId.ts";

// ------------------------------------------------------------ canonicalize

test("key order does not change the output — this is the whole point", () => {
  assert.equal(canonicalize({ a: 1, b: 2 }), canonicalize({ b: 2, a: 1 }));
});

test("nested objects are sorted at every level", () => {
  const x = { outer: { z: 1, a: { n: 2, m: 3 } } };
  const y = { outer: { a: { m: 3, n: 2 }, z: 1 } };
  assert.equal(canonicalize(x), canonicalize(y));
});

test("array ORDER is preserved — it carries meaning", () => {
  assert.notEqual(canonicalize([1, 2, 3]), canonicalize([3, 2, 1]));
  assert.equal(canonicalize([1, 2, 3]), "[1,2,3]");
});

test("primitives serialise predictably", () => {
  assert.equal(canonicalize(null), "null");
  assert.equal(canonicalize(true), "true");
  assert.equal(canonicalize(false), "false");
  assert.equal(canonicalize(42), "42");
  assert.equal(canonicalize(-0.5), "-0.5");
  assert.equal(canonicalize("hi"), '"hi"');
});

test("strings are escaped, so a quote cannot forge structure", () => {
  assert.equal(canonicalize('a"b'), '"a\\"b"');
  assert.equal(canonicalize({ 'k"1': "v" }), '{"k\\"1":"v"}');
  assert.notEqual(canonicalize({ a: '","b":"' }), canonicalize({ a: "", b: "" }));
});

test("non-finite numbers become null rather than producing invalid JSON", () => {
  assert.equal(canonicalize(NaN), "null");
  assert.equal(canonicalize(Infinity), "null");
});

test("undefined and absent fields are treated the same", () => {
  assert.equal(canonicalize({ a: 1, b: undefined }), canonicalize({ a: 1 }));
  assert.equal(canonicalize(undefined), "null");
});

test("empty containers", () => {
  assert.equal(canonicalize({}), "{}");
  assert.equal(canonicalize([]), "[]");
});

test("a realistic payload round-trips to valid JSON", () => {
  const payload = {
    householdId: "hh-1",
    visitedAt: "2026-03-10T09:00:00.000Z",
    findings: { pregnant: true, childrenUnder5: 2 },
    referrals: ["fac-a", "fac-b"],
  };
  const s = canonicalize(payload);
  assert.doesNotThrow(() => JSON.parse(s));
  assert.deepEqual(JSON.parse(s), payload);
});

test("shuffling a payload gives an identical fingerprint; changing a value does not", () => {
  const hasher = (s: string) => `h(${s.length}:${s})`;
  const a = { id: "x", n: 1, tags: ["p", "q"] };
  const shuffled = { tags: ["p", "q"], id: "x", n: 1 };
  const changed = { id: "x", n: 2, tags: ["p", "q"] };

  assert.equal(payloadFingerprint(a, hasher), payloadFingerprint(shuffled, hasher));
  assert.notEqual(payloadFingerprint(a, hasher), payloadFingerprint(changed, hasher));
});

// ------------------------------------------------------------ isUuidV4

test("accepts a well-formed v4 uuid in either case", () => {
  assert.equal(isUuidV4("3f2504e0-4f89-41d3-9a0c-0305e82c3301"), true);
  assert.equal(isUuidV4("3F2504E0-4F89-41D3-9A0C-0305E82C3301"), true);
});

test("rejects sequential or guessable ids — they would collide across devices", () => {
  assert.equal(isUuidV4("1"), false);
  assert.equal(isUuidV4("op-1"), false);
  assert.equal(isUuidV4(""), false);
});

test("rejects wrong version or variant nibbles", () => {
  assert.equal(
    isUuidV4("3f2504e0-4f89-11d3-9a0c-0305e82c3301"),
    false,
    "version 1, not 4",
  );
  assert.equal(
    isUuidV4("3f2504e0-4f89-41d3-1a0c-0305e82c3301"),
    false,
    "invalid variant nibble",
  );
});

test("rejects malformed shapes and non-strings", () => {
  assert.equal(isUuidV4("3f2504e0-4f89-41d3-9a0c-0305e82c330"), false);
  assert.equal(isUuidV4("3f2504e04f8941d39a0c0305e82c3301"), false);
  assert.equal(isUuidV4("zzzzzzzz-4f89-41d3-9a0c-0305e82c3301"), false);
  assert.equal(isUuidV4(null), false);
  assert.equal(isUuidV4(undefined), false);
  assert.equal(isUuidV4(12345), false);
  assert.equal(isUuidV4({}), false);
});
