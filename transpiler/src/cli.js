#!/usr/bin/env node
import { basename, resolve } from "node:path";
import process from "node:process";

import { executeFile, lexFile, parseFile, transpileFile } from "./index.js";

async function main() {
  const [commandOrFile, maybeFile] = process.argv.slice(2);

  if (!commandOrFile) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const hasExplicitCommand =
    commandOrFile === "lex" ||
    commandOrFile === "parse" ||
    commandOrFile === "transpile" ||
    commandOrFile === "run";
  const command = hasExplicitCommand ? commandOrFile : "lex";
  const input = hasExplicitCommand ? maybeFile : commandOrFile;

  if (!input) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const filePath = resolve(process.cwd(), input);

  if (command === "lex") {
    const tokens = await lexFile(filePath);
    console.log(`# Tokens for ${basename(filePath)}`);
    console.log(JSON.stringify(tokens, null, 2));
    return;
  }

  if (command === "parse") {
    const program = await parseFile(filePath);
    console.log(`# AST for ${basename(filePath)}`);
    console.log(JSON.stringify(program, null, 2));
    return;
  }

  if (command === "transpile") {
    const output = await transpileFile(filePath);
    console.log(output);
    return;
  }

  if (command === "run") {
    const result = await executeFile(filePath);
    console.log(`# Output for ${basename(filePath)}`);
    if (result.output.length === 0) {
      console.log("(no output)");
      return;
    }

    for (const line of result.output) {
      console.log(line);
    }
    return;
  }

  printUsage();
  process.exitCode = 1;
}

function printUsage() {
  console.error("Usage: node src/cli.js [lex|parse|transpile|run] <file.flow>");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
