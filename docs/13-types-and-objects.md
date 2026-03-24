# Types and Objects

## Define a Type

Use `Define a Type called ...:` to declare a reusable object type.

```flow
Define a Type called User:
    It has a public Name (Text).
    It has a protected Email (Text).
    It has a private Audit Note (Text, default is "created").
    It has Points (Number, default is 0).
```

Property names are phrase-style names. A property may declare a default with `default is ...`.

Supported property types in this version:

- `Text`
- `Number`
- `YesNo`
- `Function`
- `List of <Type>`
- another named FlowScript type

## Initialization Hooks

Use `When created:` inside a type to run setup logic automatically after an instance is initialized.

```flow
Define a Type called User:
    It has Points (Number, default is 0).

    When created:
        Set its Points to the result of (its Points + 10).
```

Rules:

- the hook runs automatically during `Create a <Type> called ...`
- it is not callable with `Ask`
- a type may define at most one `When created:` hook
- parent hooks run before child hooks
- the hook may use `its ...` and `Ask itself ...`

For constructor parameters, `When updated:`, and `super`, see [Constructors, Super, and Lifecycle Hooks](./14-constructors-super-and-lifecycle.md).
For action return values, see [Action Return Values](./15-action-return-values.md).

## Encapsulation

FlowScript supports three member access levels:

- `public`: accessible from anywhere
- `protected`: accessible only inside actions declared on the same type or a child type
- `private`: accessible only inside actions declared on the same type

Properties declare access levels like this:

```flow
It has a public Name (Text).
It has a protected Email (Text).
It has a private Audit Note (Text, default is "created").
```

Actions declare access levels like this:

```flow
It can "Update Email" as public using new email:
    Set its Email to new email.

It can "Normalize Email" as private:
    Print "Normalizing email.".
```

If you omit the modifier, the member is `public`.

## Actions

Use `It can "Action Name" ...:` to declare behavior on a type.

```flow
Define a Type called User:
    It has a protected Email (Text).

    It can "Update Email" as public using new email:
        Ask itself to "Normalize Email".
        Set its Email to new email.
        Print its Email.

    It can "Normalize Email" as private:
        Print "Normalizing email.".
```

Rules:

- action names are quoted strings
- parameters are positional
- omit `using` for zero-argument actions
- actions may declare `and returns <Type>`
- returning actions use explicit `Return ...` statements
- `the result of asking ...` is the value-producing action-call form
- child actions may override parent actions by quoted action name
- child actions may not narrow visibility when overriding

## Action Hooks

Use `Before "Action Name" ...:` and `After "Action Name" ...:` when logic should run automatically around an action.

```flow
Define a Type called User:
    It has a public Email (Text).

    Before "Update Email" using next email:
        Print next email.

    After "Update Email" using next email:
        Print its Email.

    It can "Update Email" as public using next email:
        Set its Email to next email.
```

Rules:

- `Before` hooks run before the action body
- `After` hooks run after the action body succeeds
- hook parameters are positional and must match the target action's arity
- hooks may use `its ...`, `Ask itself ...`, and `Ask super ...`
- inherited `Before` hooks run from parent to child
- inherited `After` hooks run from child to parent

## Self Reference

Inside an action body, use `its ...` to access the current instance.

```flow
Set its Email to new email.
Print its Email.
```

Use `Ask itself to ...` to call another action on the same instance.

```flow
Ask itself to "Normalize Email".
```

`its` and `itself` are only valid inside action bodies.

## Inheritance

Use `which is a kind of` or `which is a` to extend an existing type.

```flow
Define a Type called Admin which is a kind of User:
    It has a public Permissions (List of Text).

    It can "Update Email" as public using new email:
        Set its Email to new email.
        Print "Admin email forced update.".
```

Inheritance behavior in v1:

- child types inherit all parent properties
- child types inherit parent public and protected actions as normal dispatch targets
- parent private members remain internal to the parent type
- child actions with the same quoted name override parent public or protected actions
- action overloading is not supported

## Create Instances

Use `Create a <Type> called ...` to create an instance.

```flow
Create a User called admin user:
    Name is "Alice"
    Email is "alice@example.com"
```

You may also pass constructor arguments directly.

```flow
Create a User called admin user using "Alice", "alice@example.com".
```

You may also create an instance without an initializer block if every required property has a default.

```flow
Create a User called guest user.
```

Rules:

- missing non-default properties are errors
- unknown properties are errors
- property values are type-checked at creation time

## Read and Write Properties

Use `the <Property> of <Instance>` to read a public property.

```flow
Print the Name of admin user.
Set current points to the Points of admin user
```

Use `Set the <Property> of <Instance> to ...` to update a public property.

```flow
Set the Points of admin user to 10.
```

Direct external access to protected or private properties is rejected.

## Call Actions

Use `Ask <Instance> to "Action Name" ...` to call a public action on an object instance.

```flow
Ask admin user to "Update Email" using "team@example.com".
```

Multiple arguments use commas.

```flow
Ask report user to "Send Message" using "Hello", "Urgent".
```

Direct external calls to protected or private actions are rejected.

## Example

```flow
Define a Type called User:
    It has a public Name (Text).
    It has a protected Email (Text).
    It has a private Audit Note (Text, default is "created").
    It has Points (Number, default is 0).
    It has IsActive (YesNo, default is Yes).

    When created using name, email:
        Set its Name to name.
        Set its Email to email.
        Set its Points to the result of (its Points + 10).
        Set its Audit Note to "created through constructor".

    When updated:
        Set its Audit Note to "updated".

    It can "Normalize Email" as protected:
        Print "Normalizing email.".

    It can "Update Email" as public using new email:
        Ask itself to "Normalize Email".
        Set its Email to new email.
        Print its Email.

Define a Type called Admin which is a kind of User:
    It has a public Permissions (List of Text).

    When created using name, email, permissions:
        Set its Permissions to permissions.

    It can "Update Email" as public using new email:
        Ask super to "Update Email" using new email.
        Print "Admin email forced update.".

Create an Admin called admin user using "Alice", "alice@example.com", the list of ("manage users", "billing").

Print the Name of admin user.
Print the Points of admin user.
Ask admin user to "Update Email" using "owner@example.com".
Print admin user.
```

Expected output:

```text
Alice
10
Normalizing email.
owner@example.com
Admin email forced update.
Admin{Name: Alice, Email: owner@example.com, Audit Note: updated, Points: 10, IsActive: true, Permissions: [manage users, billing]}
```

## Not Yet Included

This step does not include:

- property interpolation such as `(its Email)` inside strings
- same-family cross-instance protected or private access
- `When deleted:` hooks or object deletion
