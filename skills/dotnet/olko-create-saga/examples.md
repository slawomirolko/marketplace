# olko-create-saga

## Examples
Load only when config shape, resolved saga shape, or prompt wording needed.

## Project adapter example
`.agents/skills/olko-create-saga/project.md`:

```yaml
sagaProject: "PricePredictor.Master"
contractsProject: "PricePredictor.Contracts"
hostSetupFile: "src/Master/Program.cs"
sagaMessageBase: "WorkflowSagaMessage"
sagaMessageBaseGeneric: "WorkflowSagaMessage<T>"
traceContextHelper: "TraceContextHelper"
resultWrapper: "ErrorOr<T>"
timeoutConfigRoot: "appsettings.json"
```

## Resolved saga shape
- saga handler → `PricePredictor.Master/Sagas/<Name>Saga.cs`
- contracts → `PricePredictor.Contracts/Sagas/<Name>Messages.cs`
- listeners → `src/Master/Program.cs`
- timeout → `appsettings.json` → `"Sagas": { "<Name>": { "Timeout": "00:05:00" } }`

## Start tuple shape
```csharp
return (saga, outgoingMessage, timeoutMessage);
```

## Completion wire contract
```csharp
public ErrorOr<TData?> Result { get; init; }
```

## Missing-details prompt
> Provide saga name, source message, each next message, every message contract, timeout value if needed, and target files.
