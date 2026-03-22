import test from "node:test";
import assert from "node:assert/strict";

import { ParserError, parse } from "../../src/index.js";

test("parser builds collection declarations with inline record definitions", () => {
  const program = parse([
    "Create a List called users defined as:",
    '    - {Name: "Alice", Age: 25, Active: Yes}',
    '    - {Name: "Bob", Age: 17, Active: No}'
  ].join("\n"));

  const statement = program.body[0];
  assert.equal(statement.type, "CollectionDeclarationStatement");
  assert.equal(statement.collectionKind, "list");
  assert.deepEqual(statement.nameParts, ["users"]);
  assert.equal(statement.items.length, 2);
  assert.equal(statement.items[0].type, "RecordLiteralExpression");
});

test("parser builds derived collection declarations with where and select clauses", () => {
  const program = parse("Create a List called active names from users where Active is Yes select Name.");
  const statement = program.body[0];

  assert.equal(statement.type, "CollectionDeclarationStatement");
  assert.equal(statement.source.type, "ReferenceExpression");
  assert.equal(statement.where.type, "ComparisonExpression");
  assert.equal(statement.select.type, "FieldReferenceExpression");
});

test("parser builds collection pipelines with ordered transform steps", () => {
  const program = parse([
    "Take raw orders:",
    "    Then filter where status is \"Delivered\"",
    "    Then sort by Amount descending",
    "    Then take the first 10 items",
    "    Then select Email",
    "    Then save to vip emails as a list"
  ].join("\n"));

  const statement = program.body[0];
  assert.equal(statement.type, "CollectionPipelineStatement");
  assert.deepEqual(statement.steps.map((step) => step.type), [
    "FilterStep",
    "SortStep",
    "TakeFirstStep",
    "SelectStep",
    "SaveStep"
  ]);
});

test("parser rejects record literals inside primitive sets", () => {
  assert.throws(() => parse([
    "Create a Set called users defined as:",
    '    - {Name: "Alice"}'
  ].join("\n")), (error) => {
    assert.ok(error instanceof ParserError);
    assert.match(error.message, /Sets only support primitive values/);
    return true;
  });
});
