# Functions and Contracts

## Function Declarations

Use `How to ...` to declare a top-level function.

```flow
How to calculate discount using price and tax and returns Number:
    Return the result of round(price * (1 + tax), 2).
```

Rules:

- functions are top-level declarations in v1
- function names are phrase-style names
- parameters are phrase-style names
- `and returns <Type>` is optional
- functions without `and returns ...` are statement-oriented

## Function Calls

Use the function name directly as a sentence for statement-form calls.

```flow
show welcome using "FlowScript".
refresh cache.
```

Use `the result of ...` when a function should produce a value.

```flow
Set discount to the result of calculate discount using 100 and 0.1
Print the result of calculate discount using 100 and 0.1.
```

Rules:

- multiple arguments use `and`
- zero-argument functions omit `using`
- returning functions may still be called in statement form; the result is ignored
- non-returning functions may not be used in `the result of ...`

## Anonymous Callables

Use anonymous callable literals when you want function behavior as a value without declaring a top-level `How to ...`.

Non-returning callable:

```flow
Set logger to do this using message:
    Ensure message is not equal to "".
    Print message.
```

Returning callable:

```flow
Set formatter to the result of this using name and returns Text:
    Ensure name is not equal to "".
    Return "User: " joined with name.
```

Rules:

- anonymous callables are first-class values
- they may appear anywhere a normal value expression is allowed
- they are called through the same direct phrase call shape as named functions
- if a variable, parameter, or property holds a callable value, you can call it directly

```flow
logger using "Hello".
Print the result of formatter using "Alice".
```

## Local Function Scope

Function parameters and plain local assignments stay inside the function.

```flow
How to calculate discount using price and tax and returns Number:
    Set total to the result of round(price * (1 + tax), 2)
    Return total.
```

Rules:

- plain `Set` inside a function is function-local by default
- local variables do not leak into the outer program
- outer/global variables remain readable through the parent context
- explicit object property writes still mutate the targeted object

## Contracts

### `Ensure`

Use `Ensure ...` at the top of a function body to declare a pre-condition.

```flow
Ensure price is greater than or equal to 0.
```

If an `Ensure` condition fails, the function stops immediately and throws an error.

### `Verify`

Use `Verify ...` near the end of a function body to declare a post-condition.

```flow
Verify total is greater than or equal to 0.
```

If a `Verify` condition fails, the function throws an error before the final return value is delivered.

Rules:

- `Ensure` clauses must appear before ordinary executable statements
- `Verify` clauses must appear after ordinary executable statements and before the final `Return`
- contracts are function-only in v1
- failure messages are generated automatically from the failed condition
- anonymous callables follow the same `Ensure` and `Verify` rules as named functions

## Return Rules

Returning functions use explicit `Return ...`.

```flow
How to get label using name and returns Text:
    Return "User: " joined with name.
```

Rules:

- `Return ...` is only valid inside functions that declare `and returns <Type>`
- returning functions must end with one final explicit `Return`
- early returns are not allowed in functions in v1
- the returned value must match the declared return type

## Example

```flow
Set prefix to "Hello, ".

Set formatter to the result of this using name and returns Text:
    Ensure name is not equal to "".
    Set label to prefix joined with name
    Verify label contains name.
    Return label.

Set logger to do this using message:
    Ensure message is not equal to "".
    Print message.

How to calculate discount using price and tax and returns Number:
    Ensure price is greater than or equal to 0.
    Ensure tax is greater than or equal to 0.
    Set total to the result of round(price * (1 + tax), 2)
    Verify total is greater than or equal to 0.
    Return total.

How to show welcome using name:
    Set message to "Hello, " joined with name
    Print message.

Set discount to the result of calculate discount using 100 and 0.1
Print discount.
show welcome using "FlowScript".
Print the result of formatter using "Alice".
logger using "ok".
```

Expected output:

```text
110
Hello, FlowScript
Hello, Alice
ok
```
