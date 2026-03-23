# Statements

## Set

Use `Set` to assign a value once.

`Set` can also update object properties with forms such as `Set the Email of admin user to "x@example.com".` or, inside actions, `Set its Email to new email.`

```flow
Set user age to 20
Set greeting to "Hello World"
Set active flag to yes
Set title status to title contains "Flow" and not title ends with "Draft"
```

The assigned value is evaluated once at assignment time.

## Print

Instances print in a predictable debug-style form, for example `User{Name: Alice, Email: alice@example.com}`.


Use `Print` to emit output.

```flow
Print greeting
Print "Age is (user age)"
Print "Age is (user age)".
```

The trailing `.` is optional.

## Define a Type

Use `Define a Type called ...:` to declare object types with typed properties and actions.

```flow
Define a Type called User:
    It has Name (Text).
    It has Email (Text).
    When created using name, email:
        Set its Name to name.
        Set its Email to email.
    When updated:
        Print "Updated".
    It can "Update Email" using new email:
        Set its Email to new email.
```

Inheritance uses `which is a kind of` or `which is a`.

## Create an Instance

Use `Create a <Type> called ...` to create an object instance.

```flow
Create a User called admin user:
    Name is "Alice"
    Email is "alice@example.com"
```

Constructor arguments are also supported.

```flow
Create a User called admin user using "Alice", "alice@example.com".
```

## Ask

Use `Ask <Instance> to "Action Name" ...` to call an action on an object instance.

```flow
Ask admin user to "Update Email" using "owner@example.com".
```

`Ask ...` is the statement form. If an action returns a value and you want to use it in an expression, use `the result of asking ...`.

## Return

Use `Return ...` inside an action that declares `and returns <Type>`.

```flow
It can "Get Display Name" and returns Text:
    Return its Name.
```

`Return` is only valid inside returning actions. Lifecycle hooks do not return values.

## How to

Use `How to ...` to declare a top-level function.

```flow
How to calculate discount using price and tax and returns Number:
    Return the result of round(price * (1 + tax), 2).
```

Functions use phrase-style names, may declare parameters with `using`, and may optionally declare `and returns <Type>`.

## Share

Use `Share ...` to expose selected top-level names from a module.

```flow
Share formatter and parse user.
Share User.
```

## Use

Use `Use ... from ...` for named imports, or `Use "./file.flow" as ...` for module aliases.

```flow
Use formatter and parse user from "./text-tools.flow".
Use "./text-tools.flow" as text tools.
```

## Ensure

Use `Ensure ...` at the top of a function body to reject invalid input before the function continues.

```flow
Ensure price is greater than or equal to 0.
```

## Verify

Use `Verify ...` near the end of a function body to validate the final state or result before the function finishes.

```flow
Verify total is greater than or equal to 0.
```

## Create a List

Use `Create a List called ...` to declare an ordered collection.

```flow
Create a List called users defined as:
    - {Name: "Alice", Age: 25, Active: Yes}
    - {Name: "Bob", Age: 17, Active: No}

Create a List called adults from users where Age >= 20.
Create a List called active names from users where Active is Yes select Name.
```

## Create a Set

Use `Create a Set called ...` to declare a unique primitive collection.

```flow
Create a Set called tags defined as:
    - "vip"
    - "trial"
    - "vip"
```

Sets keep the first-seen insertion order.

## Collection Helpers

Use natural collection helper phrases anywhere a value expression is valid.

```flow
Set first user to first item of users
Set first users to first 3 items of users
Set last users to last 2 items of users
Set picked user to item at index 2 of users
Set alice index to index of "Alice" in users
Set user slice to items from index 1 to 5 of users
Set total users to count of users
Set first adult to first item of users where Age >= 20
Set adult count to count of users where Age >= 20
Set users empty to users is empty
Set has alice to users contains item "Alice"
Set has any match to users has any of ("Alice", "Bob")
Set has all match to users has all of ("Alice", "Bob")
When item at index 0 of users is no value:
    Print "Missing".
```

Indexes are zero-based. Range ends are inclusive. Missing single-item access returns `no value`.
`first item of ... where ...` returns the first matching item or `no value`.
`count of ... where ...` returns how many items match the condition.

## Take ... Then ...

Use `Take ...:` to process a collection step by step.

```flow
Take raw orders:
    Then filter where status is "Delivered"
    Then sort by Amount descending
    Then take the first 10 items
    Then select Email
    Then save to vip emails as a list
```

A pipeline must end with `Then save to ... as a list` or `Then save to ... as a set`.

## When

Use `When`, `In case`, and `Otherwise` for branching with indented blocks.

```flow
When user age is greater than 18:
    Print "Adult".
In case user age is greater than 12:
    Print "Teen".
Otherwise:
    Print "Child".
```

## Check

Use `Check`, `Case`, and `Default` when you want to compare one value against several possible cases.

```flow
Check role:
    Case "admin":
        Print "Admin".
    Case "editor":
        Print "Editor".
    Default:
        Print "Guest".
```

## For each

Use `For each` to iterate through a list or set.

```flow
For each item in tags:
    Print item.
```

## Repeat

Use `Repeat [Number] times:` for counted loops.

```flow
Repeat 3 times:
    Print "Again".
```

## Break

Use `Break` to stop the current loop immediately.

```flow
Repeat 10 times:
    Print "Tick".
    Break.
```

`Break` is only valid inside `For each`, `Repeat`, and `Keep doing this` loops.

## Continue

Use `Continue` to skip the rest of the current loop iteration and move to the next one.

```flow
For each item in numbers:
    When item is equal to 2:
        Continue.
    Print item.
```

`Continue` is only valid inside `For each`, `Repeat`, and `Keep doing this` loops.

## Keep doing this while

Use `Keep doing this while [Condition]:` for a pre-checked loop.

```flow
Set counter to 0
Keep doing this while counter is less than 3:
    Print counter.
    Set counter to the result of (counter + 1)
```

## Keep doing this until

Use `Keep doing this until [Condition]:` when the condition describes when the loop should stop.

```flow
Set counter to 0
Keep doing this until counter is greater than or equal to 3:
    Print counter.
    Set counter to the result of (counter + 1)
```

## Ignored Words

FlowScript ignores a small set of readability words and article words to make statements read more naturally.

```flow
So Set total to 20
Then Print total.
Also Print total.
Therefore Print total.
Meanwhile Print total.
That's why Print "Total is (total)".
Set the user age to 20
Print a user age.
```

Readability phrases such as `so`, `then`, `also`, `therefore`, `meanwhile`, and `that's why` are only ignored at the start of a statement.
Articles such as `a`, `an`, and `the` are ignored inside grammar phrases and names.
