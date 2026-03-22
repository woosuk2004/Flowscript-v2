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
});
