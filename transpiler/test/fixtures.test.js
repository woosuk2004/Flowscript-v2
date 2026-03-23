import test from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { TOKEN_KINDS, lexFile } from "../src/index.js";

const fixturesRoot = fileURLToPath(new URL("../../examples", import.meta.url));

async function listFlowFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFlowFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".flow")) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

test("fixture examples tokenize cleanly across top-level and module example files", async () => {
  const files = await listFlowFiles(fixturesRoot);

  assert.ok(files.length > 0, "Expected at least one example file");

  for (const filePath of files) {
    const tokens = await lexFile(filePath);

    assert.ok(tokens.length > 0, `Expected tokens for ${filePath}`);
    assert.equal(tokens.at(-1)?.kind, TOKEN_KINDS.EOF, `Expected EOF token for ${filePath}`);
  }
});
