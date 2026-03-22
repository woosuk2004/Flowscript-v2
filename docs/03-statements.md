# Statements

## Set

Use `Set` to assign a value once.

```flow
Set user age to 20
Set greeting to "Hello World"
Set active flag to yes
Set title status to title contains "Flow" and not title ends with "Draft"
```

The assigned value is evaluated once at assignment time.

## Print

Use `Print` to emit output.

```flow
Print greeting
Print "Age is (user age)"
Print "Age is (user age)".
```

The trailing `.` is optional.

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

## Leading Readability Words

FlowScript can ignore a small set of readability words when they appear at the start of a statement.

```flow
So Set total to 20
Then Print total.
That's why Print "Total is (total)".
```

These words are readability-only and do not affect execution.
