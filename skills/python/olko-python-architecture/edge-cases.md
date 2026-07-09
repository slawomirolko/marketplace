# Olko Python Architecture Edge Cases

- Do not fix code unless the user or parent workflow asks for fixes.
- Skip generated `*_pb2*` files per docs/config; regenerate stubs via the documented generator, never by hand.
- Project docs override marketplace defaults; never hardcode package names, commands, or paths.
