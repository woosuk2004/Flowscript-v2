# Action Return Values

## Returning Actions

Actions may optionally declare a return type in the header.

```flow
It can "Get Display Name" and returns Text:
    Return its Name.
```

With parameters:

```flow
It can "Get Label" using prefix and returns Text:
    Return prefix joined with its Name.
```

Rules:

- `returns <Type>` is declared in the action header
- actions without `returns ...` remain statement-oriented
- supported return types follow the existing FlowScript type system
- child actions must keep the same return type when overriding

## Return Statements

Use `Return ...` inside a returning action.

```flow
Return its Name.
Return the result of (its Points + 10).
Return the result of asking itself to "Get Display Name".
```

Rules:

- `Return ...` is only valid inside actions that declare `returns ...`
- `Return` exits the current action immediately
- reaching the end of a returning action without `Return ...` is an error
- lifecycle hooks such as `When created:` and `When updated:` do not return values in this version

## Value-Producing Action Calls

Use `the result of asking ...` when an action call should produce a value.

```flow
Set display name to the result of asking admin user to "Get Display Name"
Print the result of asking admin user to "Get Label" using "VIP: ".
When the result of asking admin user to "Is Ready" is Yes:
    Print "Ready".
```

Supported targets match ordinary action calls:

- an instance name
- `itself`
- `super`

Statement-form `Ask ...` is still valid for returning actions. In that form, the returned value is simply ignored.

## Runtime Validation

FlowScript validates action returns at runtime.

- actions with `returns <Type>` must return a value
- the returned value must match the declared return type
- `the result of asking ...` may only call an action that declares a return type
- statement-form `Ask ...` may still call a returning action safely

## Example

```flow
Define a Type called User:
    It has a public Name (Text).
    It has a public IsActive (YesNo, default is Yes).

    When created using name:
        Set its Name to name.

    It can "Get Display Name" and returns Text:
        Return its Name.

    It can "Get Label" using prefix and returns Text:
        Return prefix joined with its Name.

    It can "Is Ready" and returns YesNo:
        Return its IsActive.

Create a User called sample user using "Alice".
Set display name to the result of asking sample user to "Get Display Name".
Print the result of asking sample user to "Get Label" using "VIP: ".
When the result of asking sample user to "Is Ready" is Yes:
    Print display name.
```

Expected output:

```text
VIP: Alice
Alice
```
