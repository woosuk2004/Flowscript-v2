# Current Scope

## Implemented

- case-insensitive keywords
- `#` comments
- sentence-style `Set`
- sentence-style `Print`
- phrase-style variable names
- boolean variants such as `yes`, `no`, `on`, `off`, `y`, `n`
- arithmetic capsules with `the result of`
- `round`, `floor`, `ceil`
- `fixed(value, digits)`
- reactive variables with `always is`
- block control flow with `When / In case / Otherwise`
- value checking with `Check / Case / Default`
- sentence-style comparison expressions
- logical operators: `and`, `or`, `not`
- string operators: `contains`, `starts with`, `ends with`, `joined with`
- string interpolation with variable references
- literal parenthesis escaping with `((` and `))`
- ignored words such as statement-leading `so`, `then`, `also`, `therefore`, `meanwhile`, `that's why`, and article words `a`, `an`, `the`
- ordered list literals with `the list of (...)`
- `Create a List called ...`
- `Create a Set called ...` for primitive sets
- collection helpers such as `first item of`, `first N items of`, `last N items of`, `index of ... in ...`, `item at index`, `items from index ... to ... of`, `count of`, `is empty`, `contains item`, `has any of (...)`, and `has all of (...)`
- the `no value` sentinel for missing collection access
- record literals inside collection syntax
- derived collections with `from`, `where`, and `select`
- collection pipelines with `Take ... Then ...`
- loops with `For each`, `Repeat`, `Keep doing this while`, and `Keep doing this until`
- loop control with `Break` and `Continue`
- custom type declarations with `Define a Type called ...`
- typed object instances, actions, inheritance, encapsulation, constructor parameters, `When created:` and `When updated:` lifecycle hooks, `super`, `its` / `itself` self references, and action return values with `Return ...` plus `the result of asking ...`
- top-level functions with `How to ...`
- direct phrase function calls and value-producing `the result of ...`
- anonymous callable literals with `do this ...:` and `the result of this ...:`
- function contracts with `Ensure` and `Verify`
- modules with `Share`, `Use ... from ...`, `Use "./file.flow" as ...`, relative `.flow` paths, module namespaces, and cycle detection

## Not Yet Implemented

- record sets
- set algebra such as union and intersection
- expression interpolation such as `"Total is (price * quantity)"`
- `When deleted:` hooks and object deletion semantics
