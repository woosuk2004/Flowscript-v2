import test from "node:test";
import assert from "node:assert/strict";

import { execute } from "../../src/index.js";

test("runtime creates typed instances with constructor parameters, applies defaults, and prints predictable instance output", () => {
  const result = execute([
    "Define a Type called User:",
    "    It has a public Name (Text).",
    "    It has a protected Email (Text).",
    "    It has a private Audit Note (Text, default is \"created\").",
    "    It has Points (Number, default is 0).",
    "    It has IsActive (YesNo, default is Yes).",
    "    When created using name, email:",
    "        Set its Name to name.",
    "        Set its Email to email.",
    "        Set its Points to the result of (its Points + 10).",
    "        Set its Audit Note to \"ready\".",
    "Create a User called admin user using \"Alice\", \"a@example.com\".",
    "Print admin user.",
    "Print the Points of admin user.",
    "Print the IsActive of admin user."
  ].join("\n"));

  assert.deepEqual(result.output, [
    "User{Name: Alice, Email: a@example.com, Audit Note: ready, Points: 10, IsActive: true}",
    "10",
    "true"
  ]);
});

test("runtime executes actions with its-bound property access, Ask itself, and Ask super", () => {
  const result = execute([
    "Define a Type called User:",
    "    It has a public Name (Text).",
    "    It has a protected Email (Text).",
    "    When created using name, email:",
    "        Set its Name to name.",
    "        Set its Email to email.",
    "    It can \"Normalize Email\" as protected:",
    '        Print "Normalized base".',
    "    It can \"Update Email\" as public using new email:",
    "        Ask itself to \"Normalize Email\".",
    "        Set its Email to new email.",
    "        Print its Email.",
    "Define a Type called Admin which is a kind of User:",
    "    It can \"Update Email\" as public using new email:",
    "        Ask super to \"Update Email\" using new email.",
    '        Print "Updated by admin".',
    "Create an Admin called admin user using \"Alice\", \"a@example.com\".",
    'Ask admin user to "Update Email" using "b@example.com".',
    "Print admin user."
  ].join("\n"));

  assert.deepEqual(result.output, [
    "Normalized base",
    "b@example.com",
    "Updated by admin",
    "Admin{Name: Alice, Email: b@example.com}"
  ]);
});

test("runtime runs parent and child When created hooks in order", () => {
  const result = execute([
    "Define a Type called User:",
    "    It has Points (Number, default is 0).",
    "    When created using seed:",
    '        Print "Parent hook".',
    "        Set its Points to the result of (its Points + seed).",
    "Define a Type called Admin which is a kind of User:",
    "    When created using seed, boost:",
    '        Print "Child hook".',
    "        Set its Points to the result of (its Points + boost).",
    "Create an Admin called admin user using 1, 10.",
    "Print the Points of admin user."
  ].join("\n"));

  assert.deepEqual(result.output, ["Parent hook", "Child hook", "11"]);
});

test("runtime runs When updated hooks after property writes and suppresses them during creation", () => {
  const result = execute([
    "Define a Type called User:",
    "    It has a public Name (Text).",
    "    It has a private Audit Note (Text, default is \"created\").",
    "    When created using name:",
    "        Set its Name to name.",
    "    When updated:",
    "        Set its Audit Note to \"updated\".",
    "Create a User called sample user using \"Alice\".",
    "Print sample user.",
    "Set the Name of sample user to \"Bob\".",
    "Print sample user."
  ].join("\n"));

  assert.deepEqual(result.output, [
    "User{Name: Alice, Audit Note: created}",
    "User{Name: Bob, Audit Note: updated}"
  ]);
});

test("runtime supports inheritance, protected access in child actions, and action override", () => {
  const result = execute([
    "Define a Type called User:",
    "    It has a public Name (Text).",
    "    It has a protected Email (Text).",
    "    It has Points (Number, default is 0).",
    "    It has IsActive (YesNo, default is Yes).",
    "    It can \"Update Email\" as public using new email:",
    '        Print "User update".',
    "Define a Type called Admin which is a kind of User:",
    "    It has a public Permissions (List of Text).",
    "    It can \"Reveal Email\" as public:",
    "        Print its Email.",
    "    It can \"Update Email\" as public using new email:",
    "        Set its Email to new email.",
    '        Print "Admin email forced update.".',
    "Create an Admin called admin user:",
    '    Name is "Alice"',
    '    Email is "a@example.com"',
    '    Permissions is the list of ("manage users", "billing")',
    'Ask admin user to "Reveal Email".',
    'Ask admin user to "Update Email" using "b@example.com".',
    "Print admin user."
  ].join("\n"));

  assert.deepEqual(result.output, [
    "a@example.com",
    "Admin email forced update.",
    "Admin{Name: Alice, Email: b@example.com, Points: 0, IsActive: true, Permissions: [manage users, billing]}"
  ]);
});

test("runtime rejects missing required properties, invalid writes, and wrong action arity", () => {
  assert.throws(
    () => execute([
      "Define a Type called User:",
      "    It has Name (Text).",
      "    It has Email (Text).",
      "Create a User called broken user:",
      '    Name is "Alice"'
    ].join("\n")),
    /Missing required property "Email"/
  );

  assert.throws(
    () => execute([
      "Define a Type called User:",
      "    It has Name (Text).",
      "    It has a public Points (Number, default is 0).",
      "Create a User called broken user:",
      '    Name is "Alice"',
      'Set the Points of broken user to "oops".'
    ].join("\n")),
    /Property "Points" must be Number/
  );

  assert.throws(
    () => execute([
      "Define a Type called User:",
      "    It has Name (Text).",
      "    It can \"Rename\" using new name:",
      "        Set its Name to new name.",
      "Create a User called broken user:",
      '    Name is "Alice"',
      'Ask broken user to "Rename".'
    ].join("\n")),
    /expects 1 argument/
  );

  assert.throws(
    () => execute([
      "Define a Type called User:",
      "    It has Name (Text).",
      "    When created using name:",
      "        Set its Name to name.",
      "Create a User called broken user."
    ].join("\n")),
    /expects 1 constructor argument/i
  );
});

test("runtime enforces private and protected access rules", () => {
  assert.throws(
    () => execute([
      "Define a Type called User:",
      "    It has a private Secret (Text, default is \"hidden\").",
      "Create a User called sample user.",
      "Print the Secret of sample user."
    ].join("\n")),
    /Cannot access private property "Secret"/
  );

  assert.throws(
    () => execute([
      "Define a Type called User:",
      "    It has a protected Email (Text).",
      "Create a User called sample user:",
      '    Email is "a@example.com"',
      "Print the Email of sample user."
    ].join("\n")),
    /Cannot access protected property "Email"/
  );

  assert.throws(
    () => execute([
      "Define a Type called User:",
      "    It has a private Secret (Text, default is \"hidden\").",
      "Define a Type called Admin which is a kind of User:",
      "    It can \"Reveal Secret\" as public:",
      "        Print its Secret.",
      "Create an Admin called admin user.",
      'Ask admin user to "Reveal Secret".'
    ].join("\n")),
    /Cannot access private property "Secret"/
  );
});

test("runtime rejects visibility-narrowing overrides", () => {
  assert.throws(
    () => execute([
      "Define a Type called User:",
      "    It can \"Update Email\" as public using new email:",
      '        Print "User update".',
      "Define a Type called Admin which is a kind of User:",
      "    It can \"Update Email\" as private using new email:",
      '        Print "Admin update".'
    ].join("\n")),
    /cannot narrow visibility from public to private/i
  );
});

test("runtime rejects invalid super calls when no parent action exists", () => {
  assert.throws(
    () => execute([
      "Define a Type called User:",
      "    It can \"Ping\" as public:",
      '        Print "Ping".',
      "Define a Type called Admin which is a kind of User:",
      "    It can \"Ping\" as public:",
      '        Ask super to "Missing".',
      "Create an Admin called admin user.",
      'Ask admin user to "Ping".'
    ].join("\n")),
    /No parent action "Missing"/i
  );
});

test("runtime supports returning actions and result-of-asking expressions", () => {
  const result = execute([
    "Define a Type called User:",
    "    It has a public Name (Text).",
    "    It has a public IsActive (YesNo, default is Yes).",
    "    When created using name:",
    "        Set its Name to name.",
    "    It can \"Get Display Name\" and returns Text:",
    "        Return its Name.",
    "    It can \"Get Label\" using prefix and returns Text:",
    "        Return prefix joined with its Name.",
    "    It can \"Is Ready\" and returns YesNo:",
    "        Return its IsActive.",
    'Create a User called sample user using "Alice".',
    'Set display name to the result of asking sample user to "Get Display Name".',
    'Print the result of asking sample user to "Get Label" using "VIP: ".',
    'When the result of asking sample user to "Is Ready" is Yes:',
    '    Print display name.'
  ].join("\n"));

  assert.deepEqual(result.output, ["VIP: Alice", "Alice"]);
});

test("runtime allows statement-form Ask to ignore a returned value", () => {
  const result = execute([
    "Define a Type called User:",
    "    It has a public Name (Text).",
    "    When created using name:",
    "        Set its Name to name.",
    "    It can \"Get Display Name\" and returns Text:",
    "        Return its Name.",
    'Create a User called sample user using "Alice".',
    'Ask sample user to "Get Display Name".',
    'Print "done".'
  ].join("\n"));

  assert.deepEqual(result.output, ["done"]);
});

test("runtime supports return values with itself and super", () => {
  const result = execute([
    "Define a Type called User:",
    "    It has a public Name (Text).",
    "    When created using name:",
    "        Set its Name to name.",
    "    It can \"Get Display Name\" and returns Text:",
    "        Return its Name.",
    "    It can \"Get Decorated Name\" and returns Text:",
    '        Return "User: " joined with the result of asking itself to "Get Display Name".',
    "Define a Type called Admin which is a kind of User:",
    "    It can \"Get Display Name\" and returns Text:",
    '        Return "Admin: " joined with the result of asking super to "Get Display Name".',
    'Create an Admin called admin user using "Alice".',
    'Print the result of asking admin user to "Get Decorated Name".',
    'Print the result of asking admin user to "Get Display Name".'
  ].join("\n"));

  assert.deepEqual(result.output, ["User: Admin: Alice", "Admin: Alice"]);
});

test("runtime rejects missing returns, return type mismatches, and value reads from non-returning actions", () => {
  assert.throws(
    () => execute([
      "Define a Type called User:",
      "    It can \"Get Name\" and returns Text:",
      '        Print "missing".',
      "Create a User called sample user.",
      'Print the result of asking sample user to "Get Name".'
    ].join("\n")),
    /must return a value/
  );

  assert.throws(
    () => execute([
      "Define a Type called User:",
      "    It can \"Get Score\" and returns Number:",
      '        Return "oops".',
      "Create a User called sample user.",
      'Print the result of asking sample user to "Get Score".'
    ].join("\n")),
    /Return value of action "Get Score" must be Number/
  );

  assert.throws(
    () => execute([
      "Define a Type called User:",
      '    It can "Ping":',
      '        Print "pong".',
      "Create a User called sample user.",
      'Print the result of asking sample user to "Ping".'
    ].join("\n")),
    /does not declare a return value/
  );
});
