import test from "node:test";
import assert from "node:assert/strict";

import { TOKEN_KINDS, lex } from "../../src/index.js";

test("lexer tokenizes module share and use statements", () => {
  const source = [
    "Share formatter and parse user.",
    "Use formatter and parse user from \"./text.flow\".",
    "Use \"./text.flow\" as text tools."
  ].join("\n");

  const kinds = lex(source).map((token) => token.kind);

  assert.ok(kinds.includes(TOKEN_KINDS.SHARE));
  assert.ok(kinds.includes(TOKEN_KINDS.USE));
  assert.ok(kinds.includes(TOKEN_KINDS.STRING));
});
