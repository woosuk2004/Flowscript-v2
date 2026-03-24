import test from "node:test";
import assert from "node:assert/strict";

import { TOKEN_KINDS, lex } from "../../src/index.js";

test("lexer tokenizes background tasks, wait statements, and try blocks", () => {
  const source = [
    "In the background:",
    "    Print \"Sending\".",
    "After 5 seconds:",
    "    Print \"Later\".",
    "Set email job to the background task:",
    "    Print \"Queued\".",
    "Set delayed job to the delayed task after 1 minute:",
    "    Print \"Delayed\".",
    "Cancel delayed job.",
    "Wait for email job for 5 seconds.",
    "Set first value to the result of wait for any of (email job, email job)",
    "Try this:",
    "    Wait for all of (email job, email job)",
    "If it fails as error:",
    "    Print the code of error."
  ].join("\n");

  const kinds = lex(source).map((token) => token.kind);

  assert.ok(kinds.includes(TOKEN_KINDS.WAIT));
  assert.ok(kinds.includes(TOKEN_KINDS.TRY));
  assert.ok(kinds.includes(TOKEN_KINDS.IN));
  assert.ok(kinds.includes(TOKEN_KINDS.THIS));
});
