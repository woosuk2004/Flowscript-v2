import test from "node:test";
import assert from "node:assert/strict";

import { LexerError, lex } from "../../src/index.js";

test("lexer rejects unterminated string literals", () => {
  assert.throws(() => lex('Set greeting to "missing end'), (error) => {
    assert.ok(error instanceof LexerError);
    assert.match(error.message, /Unterminated string literal/);
    return true;
  });
});

test("lexer rejects tab characters in source files", () => {
  assert.throws(() => lex("Set total to 10\n\tPrint total"), (error) => {
    assert.ok(error instanceof LexerError);
    assert.match(error.message, /Tabs are not allowed/);
    return true;
  });
});

test("lexer rejects unsupported characters", () => {
  assert.throws(() => lex("set total to @"), (error) => {
    assert.ok(error instanceof LexerError);
    assert.match(error.message, /Unsupported character/);
    return true;
  });
});

test("lexer rejects invalid numeric forms", () => {
  assert.throws(() => lex("Set retry count to 1_000"), (error) => {
    assert.ok(error instanceof LexerError);
    assert.match(error.message, /Invalid number literal/);
    return true;
  });
});
