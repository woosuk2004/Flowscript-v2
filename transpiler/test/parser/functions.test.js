import test from "node:test";
import assert from "node:assert/strict";

import { parse } from "../../src/index.js";

test("parser builds function declarations, contracts, and direct function calls", () => {
  const program = parse([
    "How to calculate discount using price and tax and returns Number:",
    "    Ensure price is greater than or equal to 0.",
    "    Set total to the result of round(price * (1 + tax), 2)",
    "    Verify total is greater than or equal to 0.",
    "    Return total.",
    "Set discount to the result of calculate discount using 100 and 0.1",
    "calculate discount using 100 and 0.1."
  ].join("\n"));

  assert.equal(program.body[0].type, "FunctionDeclarationStatement");
  assert.deepEqual(program.body[0].nameParts, ["calculate", "discount"]);
  assert.deepEqual(program.body[0].params, [["price"], ["tax"]]);
  assert.equal(program.body[0].body[0].type, "EnsureStatement");
  assert.equal(program.body[0].body[2].type, "VerifyStatement");
  assert.equal(program.body[0].body[3].type, "ReturnStatement");
  assert.equal(program.body[1].value.type, "FunctionCallExpression");
  assert.deepEqual(program.body[1].value.callee.nameParts, ["calculate", "discount"]);
  assert.equal(program.body[2].type, "FunctionCallStatement");
  assert.deepEqual(program.body[2].callee.nameParts, ["calculate", "discount"]);
});

test("parser rejects misplaced Ensure and Verify clauses inside functions", () => {
  assert.throws(
    () =>
      parse([
        "How to bad function and returns Number:",
        "    Set total to 1",
        "    Ensure total is greater than 0.",
        "    Return total."
      ].join("\n")),
    /Ensure statements must appear at the top/i
  );

  assert.throws(
    () =>
      parse([
        "How to bad function and returns Number:",
        "    Verify 1 is equal to 1.",
        "    Set total to 1",
        "    Return total."
      ].join("\n")),
    /Ordinary statements must appear before Verify clauses/i
  );
});

test("parser rejects early returns in functions", () => {
  assert.throws(
    () =>
      parse([
        "How to bad function and returns Number:",
        "    Return 1.",
        "    Print 2."
      ].join("\n")),
    /must end with a single final Return/i
  );
});

test("parser builds anonymous callable literals and callable references", () => {
  const program = parse([
    "Set logger to do this using message:",
    "    Ensure message is not equal to \"\".",
    "    Print message.",
    "Set formatter to the result of this using name and returns Text:",
    "    Ensure name is not equal to \"\".",
    "    Verify name is not equal to \"\".",
    "    Return name.",
    "Set label to the result of formatter using \"FlowScript\"",
    "logger using \"ok\"."
  ].join("\n"));

  assert.equal(program.body[0].value.type, "AnonymousCallableExpression");
  assert.equal(program.body[0].value.isReturning, false);
  assert.deepEqual(program.body[0].value.params, [["message"]]);
  assert.equal(program.body[1].value.type, "AnonymousCallableExpression");
  assert.equal(program.body[1].value.isReturning, true);
  assert.deepEqual(program.body[1].value.params, [["name"]]);
  assert.equal(program.body[2].value.type, "FunctionCallExpression");
  assert.deepEqual(program.body[2].value.callee.nameParts, ["formatter"]);
  assert.equal(program.body[3].type, "FunctionCallStatement");
  assert.deepEqual(program.body[3].callee.nameParts, ["logger"]);
});
