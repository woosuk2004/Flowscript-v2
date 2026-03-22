# Math and Result Capsules

## Result Capsules

Arithmetic must be wrapped in a result capsule.

```flow
Set subtotal to the result of (price * quantity)
Set discount to the result of (price * (1 + tax rate) / 2)
```

Raw arithmetic outside `the result of` is rejected.

## Operators

Supported arithmetic operators:

- `+`
- `-`
- `*`
- `/`

Operator precedence follows normal math rules:

- `*` and `/` bind tighter than `+` and `-`
- parentheses can be used for grouping

## Built-in Math Functions

### `round`

```flow
Set rounded total to the result of round(price * quantity)
Set rounded total to the result of round(price * quantity, 2)
```

- `round(value)` rounds to the nearest integer
- `round(value, 2)` rounds to the given decimal precision
- the precision argument must be a non-negative integer literal

### `floor`

```flow
Set floored total to the result of floor(price * quantity / 3)
```

### `ceil`

```flow
Set ceiled total to the result of ceil(price * quantity / 3)
```

## Display Formatting

### `fixed`

`fixed` is a display-oriented formatter, not an arithmetic helper.

```flow
Set total label to fixed(total, 2)
Print fixed(total, 2).
```

Behavior:

- returns a string
- formats a numeric value with an exact decimal precision
- must be used with exactly two arguments
- the precision argument must be a non-negative integer literal
- raw arithmetic still needs `the result of (...)`
