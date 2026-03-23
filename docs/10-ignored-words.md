# Ignored Words

FlowScript supports a small set of words that can be ignored to make code read more naturally.

## Statement-Leading Readability Words

These phrases are ignored only when they appear at the start of a statement.

Supported forms:

- `so`
- `then`
- `also`
- `therefore`
- `meanwhile`
- `that's why`

```flow
So Set price to 10
Then Print price.
Also Print price.
Therefore Print price.
Meanwhile Print price.
That's why Print "Price is (price)".
```

They are not allowed in the middle of assignments, expressions, or comparisons.

## Articles

FlowScript also ignores standalone article words inside grammar phrases and names.

Supported forms:

- `a`
- `an`
- `the`

Examples:

```flow
Set the user age to 20
Print a user age.
Create a List called the users defined as:
    - "Alice"
Take the raw orders:
    Then save to the vip emails as a list
```

## Name Normalization

Article words are dropped when FlowScript normalizes names.

These forms all refer to the same canonical name:

```flow
Set user age to 20
Set the user age to 20
Print a user age.
Print "Age is (the user age)".
```

This normalization applies to:

- variable names
- variable references
- collection names
- collection source references
- loop item names
- pipeline save targets
- interpolation references

It does not apply to:

- string contents
- comments
- record field keys such as `Name` and `Age`
