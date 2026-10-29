# olko-plan-editor project adapter

## uses
- olko-project-architecture
- olko-dotnet-architecture
- olko-dotnet-security
- olko-dotnet-style
- olko-dotnet-testing
- olko-dotnet-build
- olko-dotnet-migration
- olko-create-saga
- olko-docker-style
- olko-python-architecture
- olko-python-style
- olko-python-testing
- olko-kotlin-architecture
- olko-kotlin-security
- olko-kotlin-style
- olko-kotlin-testing
- olko-test

## config
- planDirectory: plans
- readArchitectureDocs: true
- readTestingDocs: true

## Feature implementation planning package
- When an accepted Feature already holds the business goal, progress map, and decisions, keep Task planning technical and scoped to one Task/PR.
- During Feature implementation planning, create one Task implementation file for every current child in the same session, at `plans/features/<feature-id>/tasks/<task-id>-implementation.md`. Do not create a directory per Task.
- Reuse the accepted Feature business plan and shared Feature tracker; do not copy them into per-Task `business.md`, `stack.md`, or `tracker.md` files.
- Keep the Task file even when the YouTrack description is detailed: it is the approved implementation contract consumed by that Task's implementation run.
