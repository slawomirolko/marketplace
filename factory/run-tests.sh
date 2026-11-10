#!/bin/sh
set -u
export FACTORY_TOKEN="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
export FACTORY_URL="http://127.0.0.1:7340/mcp"
export FACTORY_BACKEND=fake

start_server() {
  node src/server.ts >> /tmp/server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 50); do
    curl -sf http://127.0.0.1:7340/health > /dev/null && return 0
    sleep 0.1
  done
  echo "server did not start"; return 1
}

start_server

echo "== versions"
node -e "console.log('node', process.version, '| mcp sdk', require('/app/node_modules/@modelcontextprotocol/sdk/package.json').version)"
echo "-- legacy venv"; /opt/venv-legacy/bin/python /app/py/probe_new_api.py
echo "-- new venv"; /opt/venv-new/bin/python -W ignore /app/py/probe_new_api.py

echo; echo "== node MCP client scenario"
node test/scenario.ts; NODE_RC=$?

echo; echo "== langgraph host"
/opt/venv-legacy/bin/python /app/py/langgraph_client.py legacy; PY_RC=$?
/opt/venv-new/bin/python -W ignore /app/py/langgraph_client.py new; PY_NEW_RC=$?
[ $PY_NEW_RC -ne 0 ] && PY_RC=$PY_NEW_RC

echo; echo "== restart resilience"
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
export FACTORY_TURN_DELAY_MS=300
start_server
RUN_ID=$(node test/restart.ts begin)
sleep 0.5
node -e "const r=JSON.parse(require('fs').readFileSync('/data/runs/$RUN_ID.json'));console.log('      before kill: status='+r.status+' steps='+r.steps)"
kill -9 $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
start_server
node test/restart.ts finish "$RUN_ID"; RESTART_RC=$?

kill $SERVER_PID 2>/dev/null
echo; echo "== ledger lines on disk: $(wc -l < /data/ledger.jsonl)"
echo "== network check (must fail, container has no network):"
curl -s -m 3 https://registry.npmjs.org > /dev/null && echo "NETWORK REACHABLE" || echo "no network: OK"
echo; echo "node=$NODE_RC langgraph=$PY_RC restart=$RESTART_RC"
[ $NODE_RC -eq 0 ] && [ $PY_RC -eq 0 ] && [ $RESTART_RC -eq 0 ]
