import test from "node:test";
import assert from "node:assert/strict";

import { TOKEN_KINDS, lex } from "../../src/index.js";

test("lexer tokenizes function declarations, contracts, and direct function calls", () => {
  const source = [
    "How to calculate discount using price and tax and returns Number:",
    "    Ensure price is greater than or equal to 0.",
    "    Verify price is greater than or equal to 0.",
    "    Return price.",
    "Set total to the result of calculate discount using 100 and 0.1",
    "calculate discount using 100 and 0.1."
  ].join("\n");

  const kinds = lex(source).map((token) => token.kind);

  assert.ok(kinds.includes(TOKEN_KINDS.HOW));
  assert.ok(kinds.includes(TOKEN_KINDS.ENSURE));
  assert.ok(kinds.includes(TOKEN_KINDS.VERIFY));
  assert.ok(kinds.includes(TOKEN_KINDS.RETURNS));
  assert.ok(kinds.includes(TOKEN_KINDS.RETURN));
});

test("lexer tokenizes anonymous callable literals", () => {
  const source = [
    "Set logger to do this using message:",
    "    Print message.",
    "Set formatter to the result of this using name and returns Text:",
    "    Return name."
  ].join("\n");

  const kinds = lex(source).map((token) => token.kind);

  assert.ok(kinds.includes(TOKEN_KINDS.DO));
  assert.ok(kinds.includes(TOKEN_KINDS.THIS));
  assert.ok(kinds.includes(TOKEN_KINDS.RESULT));
  assert.ok(kinds.includes(TOKEN_KINDS.RETURNS));
});
