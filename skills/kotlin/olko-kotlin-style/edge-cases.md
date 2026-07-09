# Olko Kotlin Style Edge Cases

- Skip generated files (`build/`, generated protobuf/Route) unless docs require checking them.
- Do not install tools, add plugins, or change config; infer narrow verify commands only for already-configured project-local tools.
- Project docs override marketplace defaults; never enforce undocumented personal Kotlin opinions.
