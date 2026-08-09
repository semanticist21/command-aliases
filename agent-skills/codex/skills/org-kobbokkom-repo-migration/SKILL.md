---
name: org-kobbokkom-repo-migration
description: Safely transfer GitHub repositories into Kobbokkom.
---

# Repository migration

Use bundled `scripts/transfer-repo.sh`: resolve source, dry-run, then execute only when requested. Preserve visibility/remotes unless specified; never expose credentials. Verify auth/admin/org ownership, target availability, immutable repository ID, and transferred Actions/settings/rulesets/pages/packages/hooks/keys/secrets/environments; classic branch protection needs a separate check. Batch sequentially. Audit workflows and run only non-destructive trusted-ref smoke checks; deployment/publish/privileged runs are forbidden. Independent state/safety and behavior reviews must clear before completion.
