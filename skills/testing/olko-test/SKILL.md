---
name: olko-test
description: Run affected or all tests for .NET, Python, Android/Kotlin, React Native, and React web with change-aware scope detection, platform-specific test execution, service management, and failure handling. Android/Kotlin instrumentation remains mandatory when Kotlin changes require it. Use when asked to run tests, after implementation, or when called from olko-plan-editor/olko-commit skills.
user_invocable: true
---

# olko-test

## Routing Summary
Run affected or all tests for .NET, Python, Android/Kotlin, React Native, and React web with change-aware scope detection, platform-specific execution, and failure handling. Use when asked to run tests, after implementation, or when called from olko-plan-editor/olko-commit skills.

**Kotlin/Android instrumentation gate (non-negotiable, user directive):** whenever ANY Kotlin file changed — production or test — the FULL instrumentation suite (`connectedDebugAndroidTest`, no class filters) MUST run via the selected platform variant's instrumentation runner (see PLATFORM VARIANTS). Never filtered, never skipped, never deferred. Only outcomes: PASSED, FAILED (→ failure handling), or explicit BLOCKER after emulator recovery exhausted.

## PLATFORM VARIANTS — pick ONE before running any Android command

Android execution has three supported, mutually exclusive models. Choose the one whose
prerequisites exist in the repository. Never mix them in one run, and never silently
substitute one for the other: if the selected variant's prerequisites are missing,
report a blocker.

- **Variant A — container runner (Windows/PowerShell).** Gradle runs INSIDE the
  compose-managed Android emulator container via `scripts/invoke-gradle-watchdog.ps1`
  and `scripts/invoke-instrumentation-watchdog.ps1`. Needs `pwsh`/PowerShell on the
  host and an emulator image that ships JDK, Android SDK, and a Gradle distribution.
  This is the model described in the Android steps below.
- **Variant B — host runner (Linux/macOS).** Gradle runs ON THE HOST against a
  user-scope toolchain, and the emulator container is a DEVICE ONLY (it needs no
  JDK/SDK/Gradle). Needs the repository's host-runner scripts, e.g.
  `scripts/tests/run-gradle-linux.sh` and `scripts/tests/android-emulator.sh`.
- **Variant C — local Windows emulator (Android SDK AVD).** Gradle runs ON THE WINDOWS
  HOST from the Android project root, against a local AVD started headless through
  `$env:ANDROID_HOME\emulator\emulator.exe` (via `scripts/invoke-emulator-watchdog.ps1`).
  Needs `ANDROID_HOME`, `emulator.exe`, `adb.exe`, and at least one AVD. No Docker.

Selection rule: if the repository provides the Variant B host-runner scripts (or the
emulator image contains no JDK/SDK/Gradle), use Variant B. If it provides the
PowerShell watchdogs and a self-sufficient emulator image, use Variant A. Use Variant C
only when the repository has no compose-managed Android emulator service (no Variant A
or B prerequisites) and the Windows host has a local Android SDK with an AVD. Record the
selected variant in the report.

Git-worktree test runs use an isolated Compose project when the repository provides `scripts/tests/worktree-compose*.ps1`; the main Compose project and ports are never reused, and cleanup always runs after failures.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or command examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - smallest useful summary and normal prerequisites.
- `workflow.md` - normal execution path.
- `examples.md` - example outputs, prompts, and command snippets.
- `edge-cases.md` - failure handling, uncommon branches, and rules.
