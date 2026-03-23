import test from "node:test";
import assert from "node:assert/strict";

import { parse } from "../../src/index.js";

test("parser builds encapsulated type declarations, constructor hooks, updated hooks, inheritance, and super calls", () => {
  const program = parse([
    "Define a Type called User:",
    "    It has a public Name (Text).",
    "    It has a protected Email (Text).",
    "    It has Points (Number, default is 0).",
    "    When created using name, email:",
    "        Set its Name to name.",
    "        Set its Email to email.",
    "    When updated:",
    "        Set its Points to the result of (its Points + 10).",
    "    It can \"Normalize Email\" as private:",
    "        Print \"Normalizing\".",
    "    It can \"Update Email\" as public using new email:",
    "        Ask super to \"Normalize Email\".",
    "        Ask itself to \"Normalize Email\".",
    "        Set its Email to new email.",
    "Define a Type called Admin which is a kind of User:",
    "    It has a public Permissions (List of Text).",
    "    It can \"Update Email\" as public using new email:",
        "        Set its Email to new email.",
    "Create a User called sample user using \"Alice\", \"x@example.com\".",
    "Ask sample user to \"Update Email\" using \"x@example.com\".",
    "Print the Name of sample user."
  ].join("\n"));

  assert.equal(program.body[0].type, "TypeDeclarationStatement");
  assert.equal(program.body[0].properties.length, 3);
  assert.equal(program.body[0].properties[0].accessLevel, "public");
  assert.equal(program.body[0].properties[1].accessLevel, "protected");
  assert.equal(program.body[0].createdHook.type, "TypeLifecycleHook");
  assert.equal(program.body[0].createdHook.hookKind, "created");
  assert.deepEqual(program.body[0].createdHook.params, [["name"], ["email"]]);
  assert.equal(program.body[0].createdHook.body[0].type, "SetStatement");
  assert.equal(program.body[0].updatedHook.hookKind, "updated");
  assert.equal(program.body[0].actions.length, 2);
  assert.equal(program.body[0].actions[0].accessLevel, "private");
  assert.equal(program.body[0].actions[1].accessLevel, "public");
  assert.equal(program.body[0].actions[1].body[0].targetType, "SuperActionTarget");
  assert.equal(program.body[0].actions[1].body[1].targetType, "SelfActionTarget");
  assert.equal(program.body[0].actions[1].body[2].target.type, "SelfPropertyAssignmentTarget");
  assert.equal(program.body[1].type, "TypeDeclarationStatement");
  assert.deepEqual(program.body[1].parentTypeNameParts, ["User"]);
  assert.equal(program.body[1].actions[0].accessLevel, "public");
  assert.equal(program.body[1].properties[0].valueType.kind, "list");
  assert.equal(program.body[2].type, "InstanceCreationStatement");
  assert.equal(program.body[2].constructorArgs.length, 2);
  assert.equal(program.body[3].type, "ActionCallStatement");
  assert.equal(program.body[4].value.type, "PropertyAccessExpression");
});

test("parser builds returning actions and result-of-asking expressions", () => {
  const program = parse([
    "Define a Type called User:",
    "    It has a public Name (Text).",
    "    It can \"Get Display Name\" and returns Text:",
    "        Return its Name.",
    "Create a User called sample user:",
    "    Name is \"Alice\"",
    "Set display name to the result of asking sample user to \"Get Display Name\".",
    "Print the result of asking sample user to \"Get Display Name\"."
  ].join("\n"));

  assert.equal(program.body[0].actions[0].returnType.kind, "named");
  assert.deepEqual(program.body[0].actions[0].returnType.nameParts, ["Text"]);
  assert.equal(program.body[0].actions[0].body[0].type, "ReturnStatement");
  assert.equal(program.body[0].actions[0].body[0].value.type, "SelfPropertyExpression");
  assert.equal(program.body[2].type, "SetStatement");
  assert.equal(program.body[2].value.type, "ActionCallExpression");
  assert.equal(program.body[3].value.type, "ActionCallExpression");
  assert.equal(program.body[3].value.targetType, "InstanceReference");
});

test("parser rejects duplicate When created hooks in a type", () => {
  assert.throws(
    () =>
      parse([
        "Define a Type called User:",
        "    When created:",
        "        Print \"One\".",
        "    When created:",
        "        Print \"Two\"."
      ].join("\n")),
    /only define one 'When created:'/i
  );
});

test("parser rejects duplicate When updated hooks in a type", () => {
  assert.throws(
    () =>
      parse([
        "Define a Type called User:",
        "    When updated:",
        "        Print \"One\".",
        "    When updated:",
        "        Print \"Two\"."
      ].join("\n")),
    /only define one 'When updated:'/i
  );
});

test("parser rejects Return inside a non-returning action", () => {
  assert.throws(
    () =>
      parse([
        "Define a Type called User:",
        "    It can \"Ping\":",
        "        Return \"pong\"."
      ].join("\n")),
    /Return is only allowed inside actions that declare a return type/i
  );
});

test("parser treats my as a normal word after the its migration", () => {
  const program = parse("Print my Email.");
  assert.equal(program.body[0].type, "PrintStatement");
  assert.equal(program.body[0].value.type, "ReferenceExpression");
  assert.deepEqual(program.body[0].value.nameParts, ["my", "Email"]);
});
