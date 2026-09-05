# Agent toolkit

This GitHub repository is the public first-install and compatibility entrypoint.
The canonical repository is the Forgejo source registered in the selected
environment's verified private bootstrap metadata; internal endpoints are not
published here. GitHub is not a second write authority.

For a new machine, give your agent this repository URL and request
`$toolkit-sync`. It installs this entrypoint, resolves the intended environment,
and follows the source handoff in `skills/toolkit-sync/SKILL.md`. Existing agents
receive the same handoff on their next toolkit update. Nothing runs merely
because a repository exists; the first install/update must be invoked once.

Tailscale authentication and any required forge account/key approval remain
interactive. After source verification, Git transports toolkit updates from
Forgejo; a registered forge user CLI handles API operations such as PRs/releases.
Unavailable access preserves the existing installation and reports the missing
approval; it does not guess a source or silently return write authority to GitHub.
