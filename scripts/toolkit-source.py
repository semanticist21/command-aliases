#!/usr/bin/env python3
"""Verify an owner-approved source registration before changing the Git remote."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit

ENTRY = "https://github.com/semanticist21/agent-toolkit.git"


def registration(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError("registration must be a verified regular file")
    value = json.loads(path.read_text())
    if set(value) != {"schema_version", "repository", "branch", "continuity_commit"}:
        raise ValueError("invalid source registration")
    if value["schema_version"] != 1 or value["branch"] != "main":
        raise ValueError("unsupported source registration")
    url = urlsplit(value["repository"])
    if (url.scheme not in {"ssh", "https"} or not url.hostname or url.password or url.username == "root"
            or url.query or url.fragment or not url.path.endswith(".git")
            or (url.scheme == "https" and url.username)
            or any(c.isspace() for c in value["repository"])):
        raise ValueError("source must be a credential-free SSH/HTTPS Git URL")
    if not re.fullmatch(r"[0-9a-f]{40}", value["continuity_commit"]):
        raise ValueError("invalid continuity commit")
    return value


def git(repo, *args):
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
    # Preserve registered SSH config/keys while refusing prompts and untrusted keys.
    env["GIT_SSH_COMMAND"] = "ssh -o BatchMode=yes -o StrictHostKeyChecking=yes"
    result = subprocess.run(["git", "-C", str(repo), *args], env=env,
                            capture_output=True, text=True, timeout=60)
    if result.returncode:
        # Remote diagnostics can contain private URLs; keep them out of logs.
        raise RuntimeError("Git verification failed; inspect registered access locally")
    return result.stdout.strip()


def handoff(repo, source):
    if git(repo, "status", "--porcelain"):
        raise ValueError("preserve local changes before source handoff")
    if git(repo, "symbolic-ref", "--short", "HEAD") != source["branch"]:
        raise ValueError("handoff requires the canonical main checkout")
    for key in ("remote.pushDefault", "branch.main.pushRemote"):
        if git(repo, "config", "--default", "origin", "--get", key) != "origin":
            raise ValueError("explicit push override conflicts with canonical origin")
    current = git(repo, "remote", "get-url", "origin")
    if current not in {ENTRY, source["repository"]}:
        raise ValueError("origin conflicts with the approved entrypoint/source")
    pushes = git(repo, "remote", "get-url", "--push", "--all", "origin").splitlines()
    if len(pushes) != 1 or any(url not in {ENTRY, source["repository"]} for url in pushes):
        raise ValueError("push destination conflicts with the approved source")
    # Fetch first. Neither failed access nor divergent history changes origin/HEAD.
    git(repo, "-c", "http.followRedirects=false", "fetch", "--no-tags",
        source["repository"], "refs/heads/" + source["branch"])
    target = git(repo, "rev-parse", "FETCH_HEAD")
    git(repo, "merge-base", "--is-ancestor", source["continuity_commit"], target)
    git(repo, "merge-base", "--is-ancestor", "HEAD", target)
    if current == source["repository"] and pushes == [source["repository"]]:
        return "source_verified"
    names = git(repo, "remote").splitlines()
    if "github-bootstrap" in names:
        if git(repo, "remote", "get-url", "github-bootstrap") != ENTRY:
            raise ValueError("bootstrap remote name is already owned by another source")
    else:
        git(repo, "remote", "add", "github-bootstrap", ENTRY)
    # Set the push destination first so an interrupted switch cannot write GitHub.
    git(repo, "remote", "set-url", "--push", "origin", source["repository"])
    git(repo, "remote", "set-url", "origin", source["repository"])
    return "source_switched"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registration", required=True, type=Path,
                        help="source file from the verified selected private baseline")
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()
    try:
        print(handoff(args.repo, registration(args.registration)))
    except (ValueError, RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()
