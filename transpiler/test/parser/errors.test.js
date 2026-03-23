import test from "node:test";
import assert from "node:assert/strict";

import { ParserError, parse } from "../../src/index.js";

test("parser rejects arithmetic outside the result capsule", () => {
  assert.throws(() => parse("Set total to price * quantity"), (error) => {
    assert.ok(error instanceof ParserError);
    assert.match(error.message, /Arithmetic expressions must be wrapped/);
    return true;
  });
});

test("parser rejects bare always is declarations without Set", () => {
  assert.throws(() => parse("total always is the result of (price * quantity)"), (error) => {
    assert.ok(error instanceof ParserError);
    assert.match(error.message, /Unsupported statement/);
    return true;
  });
});

test("parser rejects soft words outside leading statement position", () => {
  assert.throws(() => parse("Set total to so"), (error) => {
    assert.ok(error instanceof ParserError);
    assert.match(error.message, /Soft words are only allowed/);
    return true;
  });

  assert.throws(() => parse("Set total to also"), (error) => {
    assert.ok(error instanceof ParserError);
    assert.match(error.message, /Soft words are only allowed/);
    return true;
  });
});

test("parser rejects break and continue outside loops", () => {
  assert.throws(() => parse("Break"), (error) => {
    assert.ok(error instanceof ParserError);
    assert.match(error.message, /Break is only allowed inside loops/);
    return true;
  });

  assert.throws(() => parse("Continue"), (error) => {
    assert.ok(error instanceof ParserError);
    assert.match(error.message, /Continue is only allowed inside loops/);
    return true;
  });
});
