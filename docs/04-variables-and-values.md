# Variables and Values

## Phrase-Style Names

FlowScript variables can contain spaces.

Examples:

```flow
Set user age to 20
Set tax rate to 0.1
Create a List called active names from users where Active is Yes select Name.
```

The parser keeps names as word sequences. The JavaScript runtime stores them as normalized phrase keys such as `"user age"` and `"tax rate"`.

## Supported Value Kinds

The current subset supports:

- numbers
- strings
- booleans
- variable references
- list literals
- collection declarations
- collection pipelines
- result expressions
- comparison expressions

Examples:

```flow
Set price to 100
Set greeting to "Hello"
Set active flag to yes
Set numbers to the list of (1, 2, 3)
Create a Set called tags defined as:
    - "vip"
    - "trial"
Set adult status to user age is greater than 18
```

## Record Literals

FlowScript supports compact record literals only inside collection syntax.

```flow
Create a List called users defined as:
    - {Name: "Alice", Age: 25, Active: Yes}
```

Record literals are not yet general-purpose values outside collection declarations and collection projections.
