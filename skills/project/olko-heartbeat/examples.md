# Olko Heartbeat Examples

## User Prompts

```text
heartbeat billing-worker
health-check invoice reconciliation
verify order-created flow is working
trace payment capture through docker and Grafana
olko-heartbeat api service login flow
```

## Grafana/Loki Query Templates

```text
{container_name="<container>"} |= "<keyword>"
{container_name=~"<container-a>|<container-b>"} |= "<keyword>"
```

```powershell
curl -s "<lokiUrl>/loki/api/v1/query_range" --data-urlencode 'query={container_name="<container>"} |= "<keyword>"' -G --data-urlencode 'limit=20'
```

## Compose Command Templates

```powershell
docker compose -f <composeFile> ps --format json
docker compose -f <composeFile> logs --tail=100 <service>
docker compose -f <composeFile> logs --since=5m <service>
```

## Flow Graph Shape

```text
[HTTP POST /orders] (src/api/orders.py:42)
  -> [CreateOrderHandler] (src/orders/create.py:18)
     -> [DB insert: orders] (src/orders/repository.py:73)
     -> [Publish OrderCreated] (src/messaging/bus.py:31)
  -> [Worker consumes OrderCreated] (src/worker/orders.py:55)
```

## Summary Shape

```text
Heartbeat: <mechanism/service>
------------------------------------------------
Flow graph: <brief tree>
Logs/traces: <found/gaps/fixed>
Compose logs: <healthy/errors/fixed>
Tests: <passed/failed/not run and why>
AGENTS.md: <complete/updated/gaps remain>
Changes: <files changed>
------------------------------------------------
Status: HEALTHY / DEGRADED (<issues>) / NEEDS FIX (<blockers>)
```
