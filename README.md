# Install toolkit-sync from Forgejo

This repository contains access instructions only. Toolkit code, skills, installers
and updates are available only from the organization's Forgejo, over Tailscale.
Do not install a historical version from this repository or use it as a fallback.

## Connect

1. Install [Tailscale](https://tailscale.com/download) and sign in to the existing
   network approved by your organization. Do not create a replacement network.
2. Obtain the Forgejo **Git clone URL** and SSH host-key fingerprint from the
   organization's trusted access registration or administrator. Existing machines
   find the source registration via `~/.agents/doc/AGENTS.local.md` and its private
   baseline's `toolkit-source.json`. A new machine needs the approved address;
   internal network names and credentials are intentionally not published here.
3. Use that registered MagicDNS hostname, not a remembered LAN address. Tailscale
   connectivity does not replace Forgejo authorization. If SSH access is missing,
   create a key on this device and register only its public key with Forgejo.
   Verify host trust; never disable SSH host-key checking or copy another device's key.

## Install

With Git installed, replace the placeholder with the approved credential-free URL:

```sh
git clone --branch main --single-branch '<approved Forgejo Git clone URL>' agent-toolkit
```

Ask your agent to read `agent-toolkit/skills/toolkit-sync/SKILL.md` **from that
Forgejo checkout** and install/run toolkit-sync. Its supporting references are in
the same checkout; do not copy only SKILL.md or install anything from GitHub history.
Subsequent toolkit installations and updates use that same Forgejo source.

If you already have an older GitHub clone, preserve local changes and installed
skills. Clone Forgejo into a separate empty directory and follow the current skill;
do not merge this guide-only branch into the toolkit checkout or sync its empty tree.
If Forgejo is unavailable, fix the registered access or request the missing approval.
Do not fall back to GitHub. Ordinary project repositories hosted on GitHub stay there.
