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
