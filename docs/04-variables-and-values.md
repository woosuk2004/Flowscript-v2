# Variables and Values

## Phrase-Style Names

FlowScript variables can contain spaces.

Examples:

```flow
Set user age to 20
Set tax rate to 0.1
Create a List called active names from users where Active is Yes select Name.
Create a User called admin user:
    Name is "Alice"
Print the Email of admin user.
```

The parser keeps names as word sequences. The JavaScript runtime stores them as normalized phrase keys such as `"user age"` and `"tax rate"`.

Standalone article words such as `a`, `an`, and `the` are dropped during name normalization.

Examples:

```flow
Set user age to 20
Set the user age to 20
Print a user age.
```

## Supported Value Kinds

The current subset supports:

- typed object instances

- numbers
- strings
- booleans
- `no value`
- variable references
- list literals
- collection declarations
- collection pipelines
- collection helper expressions
- result expressions
- action-call expressions such as `the result of asking admin user to "Get Display Name"`
- function-call expressions such as `the result of calculate discount using price and tax`
- comparison expressions
- property access expressions such as `the Email of admin user`

Examples:

```flow
Set price to 100
Set greeting to "Hello"
Set active flag to yes
Set numbers to the list of (1, 2, 3)
Set first user to first item of users
Set total users to count of users
Set display name to the result of asking admin user to "Get Display Name"
Create a Set called tags defined as:
    - "vip"
    - "trial"
Set adult status to user age is greater than 18
```

`no value` is the language-level missing-value sentinel. It is returned by helpers such as `item at index 99 of users` when the requested item does not exist.

## Record Literals

FlowScript supports compact record literals only inside collection syntax.

```flow
Create a List called users defined as:
    - {Name: "Alice", Age: 25, Active: Yes}
```

Record literals are not yet general-purpose values outside collection declarations and collection projections.
