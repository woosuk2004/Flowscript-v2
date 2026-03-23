# Lexical Rules

## Case Insensitivity

Keywords and boolean literals are case-insensitive.

These are all valid:

```flow
Set price to 10
set price to 10
SET price TO 10
```

## Comments

Comments start with `#` and continue to the end of the line.

```flow
# This line is ignored
Set price to 10
```

## Statement Boundaries

- statements are separated by newlines
- a trailing `.` after `Print` is optional
- indentation has no syntactic meaning
- tabs are rejected

## Boolean Literals

The lexer currently accepts these boolean spellings:

- `true`
- `false`
- `yes`
- `no`
- `on`
- `off`
- `y`
- `n`

## Reserved Words

The current parser recognizes these reserved words:

- `set`
- `print`
- `to`
- `always`
- `is`
- `the`
- `result`
- `round`
- `floor`
- `ceil`
- `fixed`
- `greater`
- `less`
- `equal`
- `not`
- `than`
- `or`

Because `is` is reserved for reactive bindings and comparisons, names such as `is active` are not recommended.

## Apostrophes in Words

The lexer allows apostrophes inside words.

This is currently used for readability phrases such as:

```flow
That's why Print total.
Therefore Print total.
```
