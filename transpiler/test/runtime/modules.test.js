import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { executeFile, transpileFile } from "../../src/index.js";

async function createModuleWorkspace(files) {
  const root = await mkdtemp(join(tmpdir(), "flowscript-modules-"));

  for (const [relativePath, source] of Object.entries(files)) {
    const fullPath = join(root, relativePath);
    const directory = fullPath.slice(0, fullPath.lastIndexOf("/"));
    await mkdir(directory, { recursive: true });
    await writeFile(fullPath, source);
  }

  return root;
}

test("runtime supports named imports, alias imports, shared types, and shared callable values", async () => {
  const workspace = await createModuleWorkspace({
    "text.flow": [
      "Set formatter to the result of this using name and returns Text:",
      "    Return \"Hello, \" joined with name.",
      "How to parse user using name and returns Text:",
      "    Return name.",
      "Define a Type called User:",
      "    It has a public Name (Text).",
      "    When created using name:",
      "        Set its Name to name.",
      "Share formatter and parse user and User."
    ].join("\n"),
    "main.flow": [
      "Use formatter and parse user and User from \"./text.flow\".",
      "Use \"./text.flow\" as text tools.",
      "Create a User called sample user using \"Alice\".",
      "Print the result of parse user using \"Bob\".",
      "Print the result of formatter using \"Cara\".",
      "Print the result of the formatter of text tools using \"Dana\".",
      "Print the Name of sample user."
    ].join("\n")
  });

  const result = await executeFile(join(workspace, "main.flow"));
  assert.deepEqual(result.output, ["Bob", "Hello, Cara", "Hello, Dana", "Alice"]);
});

test("runtime executes imported module top-level effects once and reuses cached modules", async () => {
  const workspace = await createModuleWorkspace({
    "shared.flow": [
      "Print \"loading shared\".",
      "Set greeting to \"hi\"",
      "Share greeting."
    ].join("\n"),
    "mid.flow": [
      "Use greeting from \"./shared.flow\".",
      "How to show greeting:",
      "    Print greeting.",
      "Share show greeting."
    ].join("\n"),
    "main.flow": [
      "Use greeting from \"./shared.flow\".",
      "Use show greeting from \"./mid.flow\".",
      "Print greeting.",
      "show greeting."
    ].join("\n")
  });

  const result = await executeFile(join(workspace, "main.flow"));
  assert.deepEqual(result.output, ["loading shared", "hi", "hi"]);
});

test("runtime rejects missing exports, missing files, circular imports, and top-level writes to imports", async () => {
  const missingExportWorkspace = await createModuleWorkspace({
    "dep.flow": [
      "Set greeting to \"hi\"",
      "Share greeting."
    ].join("\n"),
    "main.flow": "Use unknown value from \"./dep.flow\"."
  });

  await assert.rejects(
    () => transpileFile(join(missingExportWorkspace, "main.flow")),
    /does not share "unknown value"/i
  );

  const missingFileWorkspace = await createModuleWorkspace({
    "main.flow": "Use greeting from \"./missing.flow\"."
  });

  await assert.rejects(
    () => transpileFile(join(missingFileWorkspace, "main.flow")),
    /Module file not found/i
  );

  const circularWorkspace = await createModuleWorkspace({
    "a.flow": [
      "Use value from \"./b.flow\".",
      "Set own to \"a\"",
      "Share own."
    ].join("\n"),
    "b.flow": [
      "Use own from \"./a.flow\".",
      "Set value to \"b\"",
      "Share value."
    ].join("\n")
  });

  await assert.rejects(
    () => transpileFile(join(circularWorkspace, "a.flow")),
    /Circular import detected/i
  );

  const readonlyWorkspace = await createModuleWorkspace({
    "dep.flow": [
      "Set greeting to \"hi\"",
      "Share greeting."
    ].join("\n"),
    "main.flow": [
      "Use greeting from \"./dep.flow\".",
      "Set greeting to \"bye\""
    ].join("\n")
  });

  await assert.rejects(
    () => transpileFile(join(readonlyWorkspace, "main.flow")),
    /cannot import "greeting" because that name is already declared locally/i
  );
});
