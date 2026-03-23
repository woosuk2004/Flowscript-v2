import test from "node:test";
import assert from "node:assert/strict";

import { execute } from "../../src/index.js";

test("runtime executes returning functions and direct statement-form function calls", () => {
  const result = execute([
    "How to calculate discount using price and tax and returns Number:",
    "    Ensure price is greater than or equal to 0.",
    "    Ensure tax is greater than or equal to 0.",
    "    Set total to the result of round(price * (1 + tax), 2)",
    "    Verify total is greater than or equal to 0.",
    "    Return total.",
    "How to show welcome using name:",
    "    Set message to \"Hello, \" joined with name",
    "    Print message.",
    "Set discount to the result of calculate discount using 100 and 0.1",
    "Print discount.",
    "show welcome using \"FlowScript\"."
  ].join("\n"));

  assert.deepEqual(result.output, ["110", "Hello, FlowScript"]);
  assert.throws(() => result.scope.get("total"), /Undefined variable "total"/);
});

test("runtime supports function calls that read globals and call object actions", () => {
  const result = execute([
    "Define a Type called User:",
    "    It has a public Name (Text).",
    "    When created using name:",
    "        Set its Name to name.",
    "    It can \"Get Display Name\" and returns Text:",
    "        Return its Name.",
    "Create a User called sample user using \"Alice\".",
    "Set prefix to \"User: \".",
    "How to get labeled user name using user and returns Text:",
    "    Return prefix joined with the result of asking user to \"Get Display Name\".",
    "Print the result of get labeled user name using sample user."
  ].join("\n"));

  assert.deepEqual(result.output, ["User: Alice"]);
});

test("runtime enforces Ensure and Verify contracts for functions", () => {
  assert.throws(
    () =>
      execute([
        "How to calculate discount using price and tax and returns Number:",
        "    Ensure price is greater than or equal to 0.",
        "    Return price.",
        "Set bad price to the result of (0 - 1)",
        "Print the result of calculate discount using bad price and 0.1."
      ].join("\n")),
    /Ensure failed in "calculate discount": price is greater than or equal to 0/
  );

  assert.throws(
    () =>
      execute([
        "How to broken calculation using value and returns Number:",
        "    Set total to the result of (0 - 1)",
        "    Verify total is greater than or equal to 0.",
        "    Return total.",
        "Print the result of broken calculation using 1."
      ].join("\n")),
    /Verify failed in "broken calculation": total is greater than or equal to 0/
  );
});

test("runtime rejects invalid function return usage", () => {
  assert.throws(
    () =>
      execute([
        "How to show welcome using name:",
        "    Print name.",
        "Print the result of show welcome using \"Alice\"."
      ].join("\n")),
    /does not declare a return value/
  );

  assert.throws(
    () =>
      execute([
        "How to wrong score and returns Number:",
        "    Return \"oops\".",
        "Print the result of wrong score."
      ].join("\n")),
    /Return value of function "wrong score" must be Number/
  );
});

test("runtime executes anonymous callable values and preserves closures", () => {
  const result = execute([
    "Set prefix to \"Hello, \".",
    "Set formatter to the result of this using name and returns Text:",
    "    Ensure name is not equal to \"\".",
    "    Set label to prefix joined with name",
    "    Verify label contains name.",
    "    Return label.",
    "Set logger to do this using message:",
    "    Ensure message is not equal to \"\".",
    "    Print message.",
    "Print the result of formatter using \"FlowScript\".",
    "logger using \"ok\"."
  ].join("\n"));

  assert.deepEqual(result.output, ["Hello, FlowScript", "ok"]);
  assert.throws(() => result.scope.get("label"), /Undefined variable "label"/);
});

test("runtime supports anonymous callables in parameters, properties, and collections", () => {
  const result = execute([
    "Define a Type called Runner:",
    "    It has a public Formatter (Function).",
    "How to apply formatter using formatter and name and returns Text:",
    "    Return the result of formatter using name.",
    "Create a Runner called runner:",
    "    Formatter is the result of this using value and returns Text:",
    "        Return \"Runner: \" joined with value.",
    "Set callback formatter to the result of this using value and returns Text:",
    "    Return \"List: \" joined with value.",
    "Set callbacks to the list of (callback formatter)",
    "Set first callback to item at index 0 of callbacks",
    "Set runner formatter to the Formatter of runner",
    "Print the result of apply formatter using runner formatter and \"Alice\".",
    "Print the result of first callback using \"Bob\"."
  ].join("\n"));

  assert.deepEqual(result.output, ["Runner: Alice", "List: Bob"]);
});

test("runtime enforces anonymous callable contracts and return rules", () => {
  assert.throws(
    () =>
      execute([
        "Set formatter to the result of this using name and returns Text:",
        "    Ensure name is not equal to \"\".",
        "    Return name.",
        "Print the result of formatter using \"\"."
      ].join("\n")),
    /Ensure failed in "anonymous function": name is not equal to/
  );

  assert.throws(
    () =>
      execute([
        "Set formatter to the result of this using name and returns Text:",
        "    Set label to name.",
        "    Verify label contains \"z\".",
        "    Return label.",
        "Print the result of formatter using \"FlowScript\"."
      ].join("\n")),
    /Verify failed in "anonymous function": label contains z/
  );

  assert.throws(
    () =>
      execute([
        "Set formatter to do this using name:",
        "    Return name.",
        "formatter using \"Alice\"."
      ].join("\n")),
    /Return is only allowed inside functions that declare a return type/
  );
});
