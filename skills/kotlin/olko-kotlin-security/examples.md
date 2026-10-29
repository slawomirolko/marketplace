# Olko Kotlin Security Examples

Example report:

```text
Kotlin security violations (4/4 rules checked):
  1. S3 app/src/main/AndroidManifest.xml:12 - usesCleartextTraffic="true" in the main source set (source: olko-kotlin-security:S3)
  2. S4 app/src/main/java/com/example/auth/AuthInterceptor.kt:27 - access token written to Log.d (source: olko-kotlin-security:S4)
Checks:
  1. S2 app/build.gradle.kts:41 - API key injected as a BuildConfig field; the value source is not documented (source: olko-kotlin-security:S2)
```

Clean report:

```text
No Kotlin security violations found (4/4 rules checked).
```
