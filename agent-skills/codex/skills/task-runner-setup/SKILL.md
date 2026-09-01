---
name: task-runner-setup
description: Connect a repository to the self-hosted Actions runner estate without pinning it to one machine.
---

# Runner setup

Inspect repository workflows/policy and verify GitHub authority plus the current runner estate;
never register or alter org-wide runners without request. GitHub-hosted runners are forbidden.
Add the smallest isolated lane with least permissions, bounded inputs, timeout/concurrency, safe
checkout, deterministic non-secret caches, and no shared DB/worktree state. If needed adapt bundled
`scripts/dispatch-heavy.sh` (`--via actions|ssh`) using ignored environment configuration. Validate
YAML, run a non-destructive smoke, verify labels/cache/logs/cleanup, and independently review safety
and behavior.

## Select a capability, not a machine

Discover what runner sets exist before writing `runs-on`. Select the labels a job actually requires
and let it land anywhere that satisfies them. Pin an architecture, a host, or a named runner only
when something in the job genuinely requires it -- Apple tooling, an artifact whose target
architecture differs from the alternatives, a persistent cache directory, state that must survive
between jobs -- and say why in a comment on that job. A pin that only records where the runner
happened to be is what leaves a second machine idle while jobs queue.

Labels are matched as an AND: a runner must carry every label in the array, and every label you
write must be one you observed on a set that exists. An autoscaling scale set carries only the
labels it was registered with -- not the automatic `self-hosted`, OS and architecture labels an
ordinary runner gets -- so a habitual `self-hosted` added for safety is what silently excludes it.

Prefer building an artifact on a runner whose architecture matches its deployment target.

## Traps that cost real time

- **Absent is not nonexistent.** Ephemeral runners scale to zero and disappear from the org runners
  API when idle. Confirm a set from its configuration -- the runner group or scale set definition,
  which persists at zero replicas -- and only then by dispatching a job. An empty listing proves
  nothing.
- **A label does not describe an implementation.** Labels outlive the thing that created them; a set
  named for one technology may be running another. Confirm from the set's configuration or from
  whoever operates it, not from the label.
- **A self-hosted runner image is not `ubuntu-latest`.** Minimal images lack ordinary tools. Install
  what a step needs, or run that step against a pinned image -- `uses: docker://image@sha`, or
  `docker run` inside a `run:` step. There is no step-level `container:`.
- **A job-level `container:` can break JavaScript actions on musl images.** The runner injects its
  own node; it ships a musl build but selects it by an Alpine-specific check, and some deployments
  do not mount the externals volume at all. A failure to exec `/__e/node*/bin/node`, usually first
  seen as `actions/checkout` failing, is this.
- **Shared hardware takes no project's name.** Runner groups, labels, cgroup slices, systemd units
  and metric names on a shared host must be neutral. These names are one set -- rename them together
  with the dashboards and exporter filters that query them, or the panels go silently empty.
