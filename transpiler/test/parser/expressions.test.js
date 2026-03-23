import test from "node:test";
import assert from "node:assert/strict";

import { ParserError, parse } from "../../src/index.js";

test("parser builds arithmetic AST with precedence and grouped subexpressions", () => {
  const program = parse("Set discount to the result of (price * (1 + tax rate) / 2)");
  const statement = program.body[0];

  assert.equal(statement.type, "SetStatement");
  assert.deepEqual(statement.nameParts, ["discount"]);
  assert.equal(statement.value.type, "ResultExpression");
  assert.equal(statement.value.expression.type, "BinaryExpression");
  assert.equal(statement.value.expression.operator, "SLASH");
});

test("parser builds reactive Set statements with result expressions", () => {
  const program = parse("Set total always is the result of round(price * quantity, 2)");
  const statement = program.body[0];

  assert.equal(statement.type, "ReactiveSetStatement");
  assert.deepEqual(statement.nameParts, ["total"]);
  assert.equal(statement.expression.type, "ResultExpression");
  assert.equal(statement.expression.expression.type, "BuiltinCallExpression");
});

test("parser builds builtin math calls inside result expressions", () => {
  const program = parse("Set rounded total to the result of round(price * quantity / 3, 2)");
  const statement = program.body[0];

  assert.equal(statement.value.type, "ResultExpression");
  assert.equal(statement.value.expression.type, "BuiltinCallExpression");
  assert.equal(statement.value.expression.callee, "round");
  assert.equal(statement.value.expression.args.length, 2);
});

test("parser rejects non-literal round precision values", () => {
  assert.throws(() => parse("Set rounded total to the result of round(price, tax rate)"), (error) => {
    assert.ok(error instanceof ParserError);
    assert.match(error.message, /round precision must be a non-negative integer literal/);
    return true;
  });
});

test("parser builds fixed formatting calls outside result capsules", () => {
  const program = parse("Set total label to fixed(total, 2)");
  const statement = program.body[0];

  assert.equal(statement.value.type, "BuiltinCallExpression");
  assert.equal(statement.value.callee, "fixed");
  assert.equal(statement.value.args.length, 2);
});

test("parser builds list literals as value expressions", () => {
  const program = parse("Set numbers to the list of (1, 2, total)");
  const statement = program.body[0];

  assert.equal(statement.value.type, "ListExpression");
  assert.equal(statement.value.items.length, 3);
  assert.equal(statement.value.items[0].type, "LiteralExpression");
  assert.equal(statement.value.items[1].type, "LiteralExpression");
  assert.equal(statement.value.items[2].type, "ReferenceExpression");
});

test("parser builds collection helper expressions", () => {
  const program = parse([
    "Set first user to first item of users",
    "Set third user to item at index 2 of users",
    "Set middle users to items from index 1 to 3 of users",
    "Set total users to count of users",
    "Set first adult to first item of users where Age >= 20",
    "Set adult count to count of users where Age >= 20"
  ].join("\n"));

  assert.equal(program.body[0].value.type, "CollectionAccessExpression");
  assert.equal(program.body[0].value.accessKind, "first");
  assert.equal(program.body[1].value.type, "CollectionIndexExpression");
  assert.equal(program.body[2].value.type, "CollectionSliceExpression");
  assert.equal(program.body[3].value.type, "CollectionCountExpression");
  assert.equal(program.body[4].value.type, "CollectionAccessExpression");
  assert.equal(program.body[4].value.where.type, "ComparisonExpression");
  assert.equal(program.body[5].value.type, "CollectionCountExpression");
  assert.equal(program.body[5].value.where.type, "ComparisonExpression");
});

test("parser builds no value comparisons and collection predicates", () => {
  const program = parse([
    "When item at index 0 of users is no value:",
    "    Print \"Missing\".",
    "Set has alice to users contains item \"Alice\"",
    "Set users empty to users is empty"
  ].join("\n"));

  assert.equal(program.body[0].type, "WhenStatement");
  assert.equal(program.body[0].branches[0].condition.type, "ComparisonExpression");
  assert.equal(program.body[0].branches[0].condition.right.valueType, "no_value");
  assert.equal(program.body[1].value.type, "CollectionContainsExpression");
  assert.equal(program.body[2].value.type, "CollectionIsEmptyExpression");
});

test("parser builds extended collection helper expressions", () => {
  const program = parse([
    "Set first users to first 3 items of users",
    "Set last users to last 2 items of users",
    'Set alice index to index of "Alice" in users',
    'Set has any match to users has any of ("Alice", "Bob")',
    'Set has all match to users has all of ("Alice", "Bob")'
  ].join("\n"));

  assert.equal(program.body[0].value.type, "CollectionTakeExpression");
  assert.equal(program.body[0].value.side, "first");
  assert.equal(program.body[1].value.type, "CollectionTakeExpression");
  assert.equal(program.body[1].value.side, "last");
  assert.equal(program.body[2].value.type, "CollectionIndexOfExpression");
  assert.equal(program.body[3].value.type, "CollectionHasExpression");
  assert.equal(program.body[3].value.mode, "any");
  assert.equal(program.body[4].value.type, "CollectionHasExpression");
  assert.equal(program.body[4].value.mode, "all");
});

test("parser keeps phrase-style references that start with first or last", () => {
  const program = parse("Set full name to first name joined with last name");
  const statement = program.body[0];

  assert.equal(statement.value.type, "StringOperationExpression");
  assert.equal(statement.value.left.type, "ReferenceExpression");
  assert.deepEqual(statement.value.left.nameParts, ["first", "name"]);
  assert.equal(statement.value.right.type, "ReferenceExpression");
  assert.deepEqual(statement.value.right.nameParts, ["last", "name"]);
});

test("parser normalizes article words inside names and references", () => {
  const program = parse([
    "Set the user age to 20",
    "Print a user age.",
    "Set theme color to 1"
  ].join("\n"));

  assert.deepEqual(program.body[0].nameParts, ["user", "age"]);
  assert.deepEqual(program.body[1].value.nameParts, ["user", "age"]);
  assert.deepEqual(program.body[2].nameParts, ["theme", "color"]);
});

test("parser rejects non-literal has any/all item lists", () => {
  assert.throws(() => parse("Set has any match to users has any of (candidate user)"), (error) => {
    assert.ok(error instanceof ParserError);
    assert.match(error.message, /literal item list/);
    return true;
  });
});

test("parser rejects non-literal fixed precision values", () => {
  assert.throws(() => parse("Set total label to fixed(total, tax rate)"), (error) => {
    assert.ok(error instanceof ParserError);
    assert.match(error.message, /fixed precision must be a non-negative integer literal/);
    return true;
  });
});

test("parser builds comparison expressions from sentence-style comparisons", () => {
  const program = parse("Set adult status to user age is greater than or equal to 18");
  const statement = program.body[0];

  assert.equal(statement.value.type, "ComparisonExpression");
  assert.equal(statement.value.operator, "GREATER_THAN_OR_EQUAL");
  assert.deepEqual(statement.value.left, {
    type: "ReferenceExpression",
    nameParts: ["user", "age"]
  });
  assert.deepEqual(statement.value.right, {
    type: "LiteralExpression",
    valueType: "number",
    value: 18,
    raw: "18"
  });
});

test("parser builds logical expressions with string operations", () => {
  const program = parse(
    'Set title status to title contains "Flow" and not title ends with "Draft"'
  );
  const statement = program.body[0];

  assert.equal(statement.value.type, "LogicalExpression");
  assert.equal(statement.value.operator, "AND");
  assert.equal(statement.value.left.type, "StringOperationExpression");
  assert.equal(statement.value.left.operator, "CONTAINS");
  assert.equal(statement.value.right.type, "UnaryExpression");
  assert.equal(statement.value.right.argument.type, "StringOperationExpression");
  assert.equal(statement.value.right.argument.operator, "ENDS_WITH");
});

test("parser builds joined with expressions as string operations", () => {
  const program = parse("Set full name to first name joined with last name");
  const statement = program.body[0];

  assert.equal(statement.value.type, "StringOperationExpression");
  assert.equal(statement.value.operator, "JOINED_WITH");
});

test("parser builds When statements with In case and Otherwise branches", () => {
  const program = parse([
    "When user age is greater than 18:",
    "    Print \"Adult\".",
    "In case user age is greater than 12:",
    "    Print \"Teen\".",
    "Otherwise:",
    "    Print \"Child\"."
  ].join("\n"));

  const statement = program.body[0];
  assert.equal(statement.type, "WhenStatement");
  assert.equal(statement.branches.length, 2);
  assert.equal(statement.otherwiseBody.length, 1);
});

test("parser builds Check statements with Case and Default branches", () => {
  const program = parse([
    "Check role:",
    "    Case \"admin\":",
    "        Print \"Admin\".",
    "    Default:",
    "        Print \"Guest\"."
  ].join("\n"));

  const statement = program.body[0];
  assert.equal(statement.type, "CheckStatement");
  assert.equal(statement.cases.length, 1);
  assert.equal(statement.defaultBody.length, 1);
});

test("parser lowers until loops into while statements with not conditions", () => {
  const program = parse([
    "Keep doing this until total is greater than 10:",
    "    Print total."
  ].join("\n"));

  const statement = program.body[0];
  assert.equal(statement.type, "WhileStatement");
  assert.equal(statement.condition.type, "UnaryExpression");
  assert.equal(statement.condition.operator, "NOT");
  assert.equal(statement.condition.argument.type, "ComparisonExpression");
});
