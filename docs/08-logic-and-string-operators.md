# Logic and String Operators

FlowScript supports sentence-style boolean logic and string operations.

## Logical Operators

- `and`
- `or`
- `not`

Examples:

```flow
Set title status to title contains "Flow" and not title ends with "Draft"
Set greeting status to greeting starts with "Hello" or greeting ends with "!"
```

Current precedence:

- `not` binds first
- comparison and string operators bind next
- `and` binds before `or`

## String Operators

- `contains`
- `starts with`
- `ends with`
- `joined with`

Examples:

```flow
Set title status to title contains "Flow"
Set greeting status to greeting starts with "Hello"
Set draft status to title ends with "Draft"
Set full name to first name joined with last name
```

Behavior:

- `contains` returns a boolean
- `starts with` returns a boolean
- `ends with` returns a boolean
- `joined with` returns a string
