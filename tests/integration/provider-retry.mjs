import assert from "node:assert/strict";
import {
  estimateTokens,
  parseRetryAfter,
  shouldRetryStatus
} from "../../packages/provider-engine/dist/provider-engine/src/index.js";

function testEstimateTokens() {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens(null), 0);
  assert.equal(estimateTokens(undefined), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcde"), 2);
  assert.equal(estimateTokens("a".repeat(1000)), 250);
}

function testShouldRetryStatus() {
  // Explicit retryable
  assert.equal(shouldRetryStatus(429), true, "429 is retryable");
  assert.equal(shouldRetryStatus(408), true, "408 request timeout is retryable");
  assert.equal(shouldRetryStatus(500), true);
  assert.equal(shouldRetryStatus(502), true);
  assert.equal(shouldRetryStatus(503), true);
  assert.equal(shouldRetryStatus(504), true);

  // Not retryable
  assert.equal(shouldRetryStatus(200), false);
  assert.equal(shouldRetryStatus(400), false);
  assert.equal(shouldRetryStatus(401), false);
  assert.equal(shouldRetryStatus(403), false);
  assert.equal(shouldRetryStatus(404), false);
  assert.equal(shouldRetryStatus(422), false);
  assert.equal(shouldRetryStatus(501), false, "501 Not Implemented should not retry");
}

function testParseRetryAfter() {
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter(""), null);
  assert.equal(parseRetryAfter("not-a-number"), null);

  // Seconds form, clamped to MAX_RETRY_AFTER_HONOURED_MS (15000)
  assert.equal(parseRetryAfter("0"), 0);
  assert.equal(parseRetryAfter("1"), 1000);
  assert.equal(parseRetryAfter("5"), 5000);
  assert.equal(parseRetryAfter("30"), 15000, "30s is clamped to 15s");

  // HTTP-date form
  const future = new Date(Date.now() + 2000).toUTCString();
  const parsed = parseRetryAfter(future);
  assert.ok(parsed !== null && parsed >= 1000 && parsed <= 2000, "HTTP-date in the future returns a positive delta");

  const past = new Date(Date.now() - 10000).toUTCString();
  assert.equal(parseRetryAfter(past), 0, "past HTTP-date returns 0 delay");
}

function main() {
  testEstimateTokens();
  testShouldRetryStatus();
  testParseRetryAfter();
  console.log("provider retry helpers passed");
}

main();
