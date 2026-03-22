# Comparisons

FlowScript supports sentence-style comparison expressions.

## Supported Operators

- `is equal to`
- `is not equal to`
- `is greater than`
- `is less than`
- `is greater than or equal to`
- `is less than or equal to`

## Examples

```flow
Set user age to 20
Set adult status to user age is greater than or equal to 18
Set exact match to user age is equal to 20
Set hidden status to user age is less than 10
```

Comparison expressions currently work as value expressions in `Set` and `Print`.
