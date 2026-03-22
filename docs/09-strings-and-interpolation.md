# Strings and Interpolation

FlowScript strings use double quotes.

```flow
Set greeting to "Hello World"
```

## Interpolation

Variable references can be embedded in strings with parentheses.

```flow
Set user age to 20
Print "Age is (user age)".
```

Output:

```text
Age is 20
```

## Current Rules

- interpolation reads the current value of a variable
- phrase-style variable names are allowed inside interpolation
- interpolation works in printed strings and stored strings
- interpolation currently supports variable references, not full expressions

## Literal Parentheses

Use doubled parentheses to write literal parentheses in a string.

```flow
Print "Use (( and ))".
```

Output:

```text
Use ( and )
```
