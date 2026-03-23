# Lists, Sets, and Loops

## Lists

FlowScript supports ordered lists.

You can still use `the list of (...)` for lightweight value expressions.

```flow
Set numbers to the list of (1, 2, 3)
```

For larger or named collections, prefer `Create a List called ...`.

```flow
Create a List called users defined as:
    - {Name: "Alice", Age: 25, Active: Yes}
    - {Name: "Bob", Age: 17, Active: No}
```

## Derived Lists

Create a list from another collection with `from`, `where`, and `select`.

```flow
Create a List called adults from users where Age >= 20.
Create a List called active names from users where Active is Yes select Name.
```

Collection filters accept both symbolic comparisons such as `>=` and sentence-style comparisons such as `is greater than`.

## Sets

FlowScript supports primitive sets with stable insertion order.

```flow
Create a Set called tags defined as:
    - "vip"
    - "trial"
    - "vip"
```

The repeated `"vip"` value is removed, and iteration keeps the first-seen order.

## Collection Helpers

FlowScript supports sentence-style access helpers for lists and sets.

```flow
Set first user to first item of users
Set first user to first item of the users
Set last tag to last item of tags
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
```

Rules:

- indexes are zero-based
- range ends are inclusive
- `first item of ...` and `last item of ...` return `no value` for empty collections
- `first N items of ...` and `last N items of ...` always return a list
- `index of ... in ...` returns a zero-based index or `no value`
- `item at index ... of ...` returns `no value` when the index is invalid or out of range
- `items from index ... to ... of ...` always returns a list
- `first item of ... where ...` returns the first matching item or `no value`
- `count of ... where ...` returns the number of matching items
- `has any of (...)` and `has all of (...)` use literal item lists in v1
- sets use insertion order for access and slicing
- article words such as `a`, `an`, and `the` are ignored in collection names and collection references

## Pipelines

Use `Take ...:` when you want to process a collection step by step.

```flow
Take raw orders:
    Then filter where status is "Delivered"
    Then sort by Amount descending
    Then take the first 10 items
    Then select Email
    Then save to vip emails as a list
```

Available v1 steps:

- `Then filter where ...`
- `Then sort by Field ascending`
- `Then sort by Field descending`
- `Then take the first N items`
- `Then select Field`
- `Then select {Field, OtherField}`
- `Then save to name as a list`
- `Then save to name as a set`

## For each

Use `For each` to iterate through a list or set.

```flow
For each tag in tags:
    Print tag.
```

The loop item name is block-local. It is available only inside the loop body.

## Repeat

Use `Repeat [Number] times:` when you want a counted loop.

```flow
Repeat 3 times:
    Print "Again".
```

The repeat count must evaluate to a non-negative integer.

## Break

Use `Break` when a loop should stop immediately.

```flow
Repeat 10 times:
    Print "Tick".
    Break.
```

## Continue

Use `Continue` when the current iteration should be skipped.

```flow
For each item in numbers:
    When item is equal to 2:
        Continue.
    Print item.
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

Use `Keep doing this until [Condition]:` when the condition should end the loop.

```flow
Set counter to 0
Keep doing this until counter is greater than or equal to 3:
    Print counter.
    Set counter to the result of (counter + 1)
```

`until` is syntactic sugar for `while not`.
