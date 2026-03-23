import test from "node:test";
import assert from "node:assert/strict";

import { parse } from "../../src/index.js";

test("parser builds share statements and both use statement forms", () => {
  const program = parse([
    "Share formatter and parse user.",
    "Use formatter and parse user from \"./text.flow\".",
    "Use \"./text.flow\" as text tools."
  ].join("\n"));

  assert.equal(program.body[0].type, "ShareStatement");
  assert.deepEqual(program.body[0].namePartsList, [["formatter"], ["parse", "user"]]);

  assert.equal(program.body[1].type, "UseNamedStatement");
  assert.deepEqual(program.body[1].imports, [["formatter"], ["parse", "user"]]);
  assert.equal(program.body[1].sourcePath, "./text.flow");

  assert.equal(program.body[2].type, "UseModuleAliasStatement");
  assert.equal(program.body[2].sourcePath, "./text.flow");
  assert.deepEqual(program.body[2].aliasNameParts, ["text", "tools"]);
});

test("parser reads alias-based access and result calls through module namespaces", () => {
  const program = parse([
    "Use \"./text.flow\" as text tools.",
    "Print the formatter of text tools.",
    "Print the result of the parse user of text tools using \"Alice\"."
  ].join("\n"));

  assert.equal(program.body[1].value.type, "PropertyAccessExpression");
  assert.deepEqual(program.body[1].value.propertyNameParts, ["formatter"]);
  assert.deepEqual(program.body[1].value.instanceNameParts, ["text", "tools"]);

  assert.equal(program.body[2].value.type, "FunctionCallExpression");
  assert.equal(program.body[2].value.callee.type, "PropertyAccessExpression");
  assert.deepEqual(program.body[2].value.callee.propertyNameParts, ["parse", "user"]);
  assert.deepEqual(program.body[2].value.callee.instanceNameParts, ["text", "tools"]);
});
