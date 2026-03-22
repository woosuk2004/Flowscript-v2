# Reactive Variables

## `always is`

Use `always is` to bind a variable to a live expression.

```flow
Set total always is the result of round(price * quantity * (1 + tax rate), 2)
```

Unlike plain `Set`, a reactive variable is recomputed every time it is read.

## Example

```flow
Set price to 100
Set quantity to 2
Set total always is the result of (price * quantity)
```

If `price` changes later, `total` returns the updated value automatically.

## Cycle Detection

Reactive dependency cycles raise a runtime error.

```flow
Set a always is the result of (b + 1)
Set b always is the result of (a + 1)
```
