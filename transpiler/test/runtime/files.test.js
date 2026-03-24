import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { executeFile } from "../../src/index.js";

async function createWorkspace(files) {
  const root = await mkdtemp(join(tmpdir(), "flowscript-files-"));

  for (const [relativePath, source] of Object.entries(files)) {
    const fullPath = join(root, relativePath);
    const directory = fullPath.slice(0, fullPath.lastIndexOf("/"));
    await mkdir(directory, { recursive: true });
    await writeFile(fullPath, source);
  }

  return root;
}

test("runtime supports reading, writing, appending, checking, and deleting files through the standard files module", async () => {
  const workspace = await createWorkspace({
    "main.flow": [
      "Use read text from file and write text to file and append text to file and file exists and delete file from \"./standard/files.flow\".",
      "Wait for write text to file using \"./notes.txt\" and \"Hello\".",
      "Wait for append text to file using \"./notes.txt\" and \" world\".",
      "Print the result of wait for read text from file using \"./notes.txt\".",
      "Print the result of wait for file exists using \"./notes.txt\".",
      "Wait for delete file using \"./notes.txt\".",
      "Print the result of wait for file exists using \"./notes.txt\"."
    ].join("\n")
  });

  const result = await executeFile(join(workspace, "main.flow"));

  assert.deepEqual(result.output, ["Hello world", "true", "false"]);
  assert.equal(existsSync(join(workspace, "notes.txt")), false);
});

test("runtime returns structured file errors and rejects paths outside the workspace", async () => {
  const workspace = await createWorkspace({
    "main.flow": [
      "Use read text from file from \"./standard/files.flow\".",
      "Try this:",
      "    Print the result of wait for read text from file using \"../outside.txt\".",
      "If it fails as error:",
      "    Print the code of error.",
      "    Print the kind of error.",
      "    Print the message of error."
    ].join("\n")
  });

  const result = await executeFile(join(workspace, "main.flow"));
  assert.deepEqual(result.output, ["INVALID_FILE_PATH", "FilePathError", "File path must stay inside the workspace"]);
});

test("runtime resolves file paths relative to the module that contains the call site", async () => {
  const workspace = await createWorkspace({
    "sub/helper.flow": [
      "Use read text from file from \"./standard/files.flow\".",
      "How to load sample and returns Text:",
      "    Return the result of wait for read text from file using \"./data.txt\".",
      "Share load sample."
    ].join("\n"),
    "sub/data.txt": "Hello from helper",
    "main.flow": [
      "Use load sample from \"./sub/helper.flow\".",
      "Print the result of load sample."
    ].join("\n")
  });

  const result = await executeFile(join(workspace, "main.flow"));
  assert.deepEqual(result.output, ["Hello from helper"]);
});

test("runtime can read back appended content from a nested module and leaves caller files untouched", async () => {
  const workspace = await createWorkspace({
    "sub/file-tools.flow": [
      "Use write text to file and append text to file and read text from file from \"./standard/files.flow\".",
      "How to build log and returns Text:",
      "    Wait for write text to file using \"./log.txt\" and \"A\".",
      "    Wait for append text to file using \"./log.txt\" and \"B\".",
      "    Return the result of wait for read text from file using \"./log.txt\".",
      "Share build log."
    ].join("\n"),
    "main.flow": [
      "Use build log from \"./sub/file-tools.flow\".",
      "Print the result of build log."
    ].join("\n")
  });

  const result = await executeFile(join(workspace, "main.flow"));

  assert.deepEqual(result.output, ["AB"]);
  assert.equal(await readFile(join(workspace, "sub/log.txt"), "utf8"), "AB");
  assert.equal(existsSync(join(workspace, "log.txt")), false);
});
