---
kind: sharkbay_task
taskId: K8D2UX-u3960864-m81ae10
taskTag: K8D2UX
mode: quick
title: Copy semantic interface design skill
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 01a0131b-5767-7201-a360-75c1747ead19
branch: main
createdAt: 2026-08-18T09:47:39Z
updatedAt: 2026-08-18T09:50:37Z
completedAt: 2026-08-18T09:50:37Z
---

## Summary

Copied the validated WeShop semantic interface design skill into SharkBay as an identical project-local skill.

## Files

- .sharkbay/tasks/K8D2UX-u3960864-m81ae10-copy-semantic-interface-skill.md
- .agents/skills/design-semantic-interfaces/SKILL.md
- .agents/skills/design-semantic-interfaces/agents/openai.yaml

## Work

- Identified SharkUI/SharkBay as the target repository and confirmed no existing skill at the destination.
- Kept the SharkBay copy intentionally identical to the WeShop source skill.
- Added the skill definition and discovery metadata under SharkBay's project-local `.agents/skills` directory.

## Verification

- `quick_validate.py .agents/skills/design-semantic-interfaces` passed.
- `git diff --check -- .agents/skills/design-semantic-interfaces .sharkbay/tasks/K8D2UX-u3960864-m81ae10-copy-semantic-interface-skill.md` passed.
- `diff -ru` against the WeShop source produced no differences.

## Notes

- The source skill is tracked in WeShop task S7M4UI-u3960864-m7b574d.
