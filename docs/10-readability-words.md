# Readability Words

FlowScript supports a very small set of words that exist only to improve readability.

## Supported Forms

- `so`
- `then`
- `that's why`

## Scope

These phrases are ignored only when they appear at the start of a statement.

```flow
So Set price to 10
Then Print price.
That's why Print "Price is (price)".
```

They are not allowed in the middle of assignments, expressions, or comparisons.
