# Olko Design Rules Examples

Code time:

```text
olko-design-rules findings (20/20 rules scanned):
  1. D4 src/Orders/IOrderTotalCalculator.cs:3 — interface has one implementation and no architecture rule requires it — use the concrete type until a second variant exists  (source: olko-design-rules:D4)
  2. C1 src/Orders/OrderService.cs:41 — happy path is three levels deep inside guard checks — invert the guards and return early  (source: olko-design-rules:C1)
  3. C7 src/Orders/OrderService.cs:58 — list search inside a per-row loop — build a dictionary keyed by order id once, then look up  (source: olko-design-rules:C7)
```

Plan time:

```text
olko-design-rules findings (9/9 rules scanned):
  1. D6 plan "Configuration" section: `ExportBatchSize` — every planned caller uses the same value — use a constant until a second value is needed  (source: olko-design-rules:D6)
```
