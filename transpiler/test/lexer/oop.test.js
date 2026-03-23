import test from "node:test";
import assert from "node:assert/strict";

import { TOKEN_KINDS, lex } from "../../src/index.js";

test("lexer tokenizes constructor hooks, updated hooks, and super action calls", () => {
  const source = [
    "Define a Type called User:",
    "    It has a private Email (Text).",
    "    When created using email:",
    "        Set its Email to \"created@example.com\".",
    "    When updated:",
    "        Print its Email.",
    "    It can \"Normalize Email\" as private:",
    "        Set its Email to \"x@example.com\".",
    "    It can \"Update Email\" as public using new email:",
    "        Ask super to \"Normalize Email\".",
    "        Ask itself to \"Normalize Email\".",
    "Create a User called admin user using \"a@example.com\".",
    "Ask admin user to \"Normalize Email\"."
  ].join("\n");

  const tokens = lex(source);
  const kinds = tokens.map((token) => token.kind);

  assert.deepEqual(kinds, [
    TOKEN_KINDS.DEFINE,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TYPE,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.COLON,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.INDENT,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.PRIVATE,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.LPAREN,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.RPAREN,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.WHEN,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.COLON,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.INDENT,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.ITS,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.DEDENT,
    TOKEN_KINDS.WHEN,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.COLON,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.INDENT,
    TOKEN_KINDS.PRINT,
    TOKEN_KINDS.ITS,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.DEDENT,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.PRIVATE,
    TOKEN_KINDS.COLON,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.INDENT,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.ITS,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.DEDENT,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.PUBLIC,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.COLON,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.INDENT,
    TOKEN_KINDS.ASK,
    TOKEN_KINDS.SUPER,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.ASK,
    TOKEN_KINDS.ITSELF,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.DEDENT,
    TOKEN_KINDS.DEDENT,
    TOKEN_KINDS.CREATE,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.ASK,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.EOF
  ]);
});

test("lexer tokenizes returning actions, Return statements, and result-of-asking expressions", () => {
  const source = [
    "Define a Type called User:",
    "    It has a public Name (Text).",
    "    It can \"Get Display Name\" and returns Text:",
    "        Return its Name.",
    "Create a User called sample user:",
    "    Name is \"Alice\"",
    "Set display name to the result of asking sample user to \"Get Display Name\".",
    "Print the result of asking sample user to \"Get Display Name\"."
  ].join("\n");

  const kinds = lex(source).map((token) => token.kind);

  assert.ok(kinds.includes(TOKEN_KINDS.RETURNS));
  assert.ok(kinds.includes(TOKEN_KINDS.RETURN));
  assert.ok(kinds.includes(TOKEN_KINDS.RESULT));
});
