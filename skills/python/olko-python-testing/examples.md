# Olko Python Testing Examples

Example report:

```text
Python test convention violations:
  1. tests/test_config.py:18 - test asserts a key is absent from YAML config (source: olko-python-testing:What not to test)
  2. tests/test_service_integration.py:42 - integration test monkeypatches a real gRPC client (source: olko-python-testing:Test doubles)
  3. tests/test_agent.py:7 - early return bypasses assertions when precondition not met (source: olko-python-testing:No silent pass)
```
