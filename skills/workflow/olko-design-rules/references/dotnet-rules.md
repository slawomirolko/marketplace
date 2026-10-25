# .NET-only rules (C# files; code time only)

Apply these rules only to changed lines in `.cs` files.

### N1 - Enum members without explicit numeric values
Flag `enum Status { Active, Closed }`.
Fix: give each member an explicit value, for example `enum Status { Active = 0, Closed = 1 }`. If a member moves, the stored or serialized value then does not change.

### N2 - Leaf type without `sealed`
Flag a class or record that has no subtypes and no design for inheritance, and is not `sealed`. Small model and DTO types are the usual case.
Fix: add `sealed`.
Do not flag: a type that a framework must subclass or proxy (for example, a lazy-loading entity proxy).

### N3 - Static field declaration-order dependency
Flag a `static readonly` field whose initializer reads another static field declared below it. Also flag an initializer that is correct only because another field is declared above it.
C# runs static field initializers in declaration order. If somebody moves the fields, the value can silently become `default` or empty. Flag it also when it works now.
Fix: compute the value in a static constructor or a lazy property, or remove the dependency between the fields.
