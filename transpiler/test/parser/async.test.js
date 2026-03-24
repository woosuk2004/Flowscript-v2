import test from "node:test";
import assert from "node:assert/strict";

import { parse } from "../../src/index.js";

test("parser builds waits with timeouts, error-bound try blocks, and cleanup blocks", () => {
  const program = parse([
    "After 5 seconds:",
    "    Print \"Later\".",
    "In the background:",
    "    Print \"Sending\".",
    "Set email job to the background task:",
    "    Print \"Queued\".",
    "Set delayed job to the delayed task after 1 minute:",
    "    Print \"Delayed\".",
    "Cancel delayed job.",
    "Wait for email job for 5 seconds.",
    "Set first value to the result of wait for any of (email job, email job) for 1 minute",
    "Try this:",
    "    Wait for all of (email job, email job) for 500 milliseconds",
    "If it fails as error:",
    "    Print \"Failed\"."
    ,
    "In any case:",
    "    Print \"Cleanup\"."
  ].join("\n"));

  assert.equal(program.body[0].type, "DelayedStatement");
  assert.equal(program.body[0].delay.unit, "seconds");
  assert.equal(program.body[1].type, "BackgroundStatement");
  assert.equal(program.body[2].type, "SetStatement");
  assert.equal(program.body[2].value.type, "BackgroundTaskExpression");
  assert.equal(program.body[3].type, "SetStatement");
  assert.equal(program.body[3].value.type, "DelayedTaskExpression");
  assert.equal(program.body[3].value.delay.unit, "minute");
  assert.equal(program.body[4].type, "CancelStatement");
  assert.equal(program.body[5].type, "WaitStatement");
  assert.equal(program.body[5].timeout.unit, "seconds");
  assert.equal(program.body[6].value.type, "WaitExpression");
  assert.equal(program.body[6].value.target.type, "WaitAnyExpression");
  assert.equal(program.body[6].value.timeout.unit, "minute");
  assert.equal(program.body[7].type, "TryStatement");
  assert.equal(program.body[7].tryBody[0].type, "WaitStatement");
  assert.equal(program.body[7].tryBody[0].target.type, "WaitAllExpression");
  assert.equal(program.body[7].tryBody[0].timeout.unit, "milliseconds");
  assert.deepEqual(program.body[7].errorNameParts, ["error"]);
  assert.equal(program.body[7].finallyBody[0].type, "PrintStatement");
});
