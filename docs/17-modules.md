# Modules

FlowScript modules let us split code across `.flow` files with explicit sharing.

## Share

Use `Share` to expose top-level names from a module.

```flow
Set formatter to the result of this using name and returns Text:
    Return "Hello, " joined with name.

How to parse user using name and returns Text:
    Return name.

Share formatter and parse user.
```

Only explicitly shared top-level names are visible to other modules.

## Named Imports

Use `Use ... from ...` to import shared names directly.

```flow
Use formatter and parse user from "./text-tools.flow".

Print the result of parse user using "Alice".
Print the result of formatter using "Bob".
```

Named imports are read-only aliases in the importing module.

## Module Alias Imports

Use `Use "./file.flow" as ...` when you want a namespace-style import.

```flow
Use "./text-tools.flow" as text tools.

Print the formatter of text tools.
Print the result of the parse user of text tools using "Alice".
```

Alias access reuses FlowScript's existing `the ... of ...` phrasing.

## Supported Shared Names

In this version, a module may share top-level:

- variables created with `Set`
- collections created with `Create a List called ...` or `Create a Set called ...`
- functions declared with `How to ...`
- types declared with `Define a Type called ...`
- top-level callable values stored in variables

## Paths

Module paths must be:

- relative
- explicitly quoted
- explicitly ended with `.flow`

Examples:

```flow
Use formatter from "./text-tools.flow".
Use User from "../models/user.flow".
Use "./text-tools.flow" as text tools.
```

## Execution Model

- imported modules run before the importing module continues
- each module runs at most once
- top-level effects in imported modules are allowed
- circular imports are rejected with a clear error

## Notes

- `Share` is required; top-level declarations are private by default
- named imports and alias imports are separate forms in v1
- renaming, wildcard imports, and package-style module paths are not supported yet
