---
name: olko-mobile-network-sync
description: "Detect the host LAN IP, update configured mobile app and compose network URLs, fix container auth authority, rebuild configured services, verify WiFi sign-in reachability, and report manual OAuth redirect actions. Triggers: 'sync mobile network', 'fix phone login over WiFi', 'make app work on my network', 'update mobile IP', 'mobile network sync'."
user_invocable: true
---

# olko-mobile-network-sync

## Routing Summary
Host LAN IP sync for mobile sign-in over WiFi. Updates configured app and compose URLs, fixes auth authority, rebuilds configured services, verifies reachability, reports OAuth redirect URI.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or command examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - summary, triggers, config keys.
- `workflow.md` - normal sync and verification path.
- `examples.md` - adapter and report examples.
- `edge-cases.md` - failure handling and safety rules.
