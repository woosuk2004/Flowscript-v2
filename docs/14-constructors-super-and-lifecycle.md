# Constructors, Super, and Lifecycle Hooks

## Constructor Parameters

FlowScript supports sentence-style constructor parameters through `When created using ...:` inside a type and `Create ... using ...` at the call site.

```flow
Define a Type called User:
    It has a public Name (Text).
    It has a protected Email (Text).

    When created using name, email:
        Set its Name to name.
        Set its Email to email.
```

Create an instance like this:

```flow
Create a User called admin user using "Alice", "alice@example.com".
```

Rules:

- constructor arguments are positional
- the constructor arity of a type is the largest `When created using ...` parameter count across its inheritance chain
- parent and child `When created:` hooks receive the same argument list
- parent hooks may use only the leading arguments they declare
- constructor arguments run before the finished instance is exposed

## Creation Order

FlowScript creates an instance in this order:

1. allocate the instance storage
2. apply property defaults
3. apply explicit initializer-block values
4. run `When created:` hooks from parent to child
5. validate that every required property now has a valid value
6. expose the finished instance

This means constructor hooks can fill required properties.

## Super Calls

Use `Ask super to ...` inside an action or lifecycle hook to call the nearest inherited action with the same quoted name.
Use `the result of asking super to ...` when the parent action returns a value.

```flow
Define a Type called User:
    It can "Update Email" as public using new email:
        Set its Email to new email.

Define a Type called Admin which is a kind of User:
    It can "Update Email" as public using new email:
        Ask super to "Update Email" using new email.
        Print "Admin email forced update.".
```

Rules:

- `super` is only valid inside actions and lifecycle hooks
- `super` calls the nearest inherited non-private action
- parent private actions are not callable with `super`
- `super` keeps the current instance and forwards the given arguments
- `super` may be used in both statement-form and value-producing action calls
- `super` is action-only in this version; property-level `super` access is not included

## Lifecycle Hooks

FlowScript currently supports two lifecycle hooks inside a type:

- `When created:`
- `When updated:`

### `When created:`

Use `When created:` for setup logic that runs automatically during instance creation.

```flow
When created using name, email:
    Set its Name to name.
    Set its Email to email.
```

### `When updated:`

Use `When updated:` for logic that runs after a property write completes.

```flow
When updated:
    Set its Audit Note to "updated".
```

Rules:

- `When updated:` has no parameters in v1
- parent and child update hooks both run in parent-to-child order
- update hooks are suppressed during instance creation
- nested property writes inside an update hook do not re-trigger update hooks again in the same update cycle
- lifecycle hooks do not return values in this version

## Why `When deleted:` Is Deferred

`When deleted:` is intentionally not part of the language yet.

Reason:

- FlowScript does not yet have a first-class delete or destruction statement
- without an explicit object lifetime model, a deletion hook would be underspecified
- `When updated:` is already useful today because property writes exist now

So the current recommendation is:

- ship `When created:` and `When updated:` now
- add `When deleted:` only when FlowScript gains explicit deletion semantics
