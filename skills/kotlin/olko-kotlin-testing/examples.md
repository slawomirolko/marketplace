# Olko Kotlin Testing Examples

Example report:

```text
Kotlin test convention violations:
  1. app/src/test/.../ConfigTest.kt:18 - test asserts a value is absent from build.gradle.kts (source: olko-kotlin-testing:What not to test)
  2. app/src/androidTest/.../HomeScreenInstrumentationTest.kt:42 - instrumentation test mocks the Retrofit transport (source: olko-kotlin-testing:Instrumentation boundaries)
  3. app/src/test/.../AuthViewModelTest.kt:7 - early return bypasses assertions when precondition not met (source: olko-kotlin-testing:No silent pass)
  4. app/src/androidTest/.../LoginScreenTest.kt:25 - `fun login click works()` uses a spaced backtick name (source: olko-kotlin-testing:Instrumentation test naming)
```
