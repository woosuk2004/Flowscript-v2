import test from "node:test";
import assert from "node:assert/strict";

import { parse } from "../../src/index.js";

test("parser reads multiple sentence statements into one program", () => {
  const program = parse([
    "So Set price to 100",
    "Set quantity to 2",
    "Set total always is the result of round(price * quantity, 2)",
    "Set valid status to total is greater than 100",
    "Then Print total.",
    "That's why Print valid status"
  ].join("\n"));

  assert.equal(program.body.length, 6);
  assert.equal(program.body[3].value.type, "ComparisonExpression");
  assert.equal(program.body[4].type, "PrintStatement");
  assert.equal(program.body[4].terminated, true);
  assert.equal(program.body[5].type, "PrintStatement");
  assert.equal(program.body[5].terminated, false);
});

test("parser reads block statements alongside sentence statements", () => {
  const program = parse([
    "Set user age to 20",
    "When user age is greater than 18:",
    "    Print \"Adult\".",
    "Check user age:",
    "    Case 20:",
    "        Print \"Twenty\".",
    "    Default:",
    "        Print \"Other\"."
  ].join("\n"));

  assert.equal(program.body.length, 3);
  assert.equal(program.body[1].type, "WhenStatement");
  assert.equal(program.body[2].type, "CheckStatement");
});

test("parser reads list and loop statements alongside existing block statements", () => {
  const program = parse([
    "Set numbers to the list of (1, 2, 3)",
    "For each item in numbers:",
    "    When item is greater than 1:",
    "        Print item.",
    "Repeat 2 times:",
    "    Print \"Again\".",
    "Keep doing this while counter is less than 3:",
    "    Print counter."
  ].join("\n"));

  assert.equal(program.body.length, 4);
  assert.equal(program.body[0].type, "SetStatement");
  assert.equal(program.body[0].value.type, "ListExpression");
  assert.equal(program.body[1].type, "ForEachStatement");
  assert.equal(program.body[1].body[0].type, "WhenStatement");
  assert.equal(program.body[2].type, "RepeatStatement");
  assert.equal(program.body[3].type, "WhileStatement");
});
