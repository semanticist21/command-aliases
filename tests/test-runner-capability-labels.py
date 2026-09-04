#!/usr/bin/env python3
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REFERENCE = (
    ROOT
    / "skills"
    / "task-runner-setup"
    / "references"
    / "capability-labels.md"
)


def load_catalog() -> dict:
    text = REFERENCE.read_text(encoding="utf-8")
    match = re.search(
        r"<!-- capability-catalog:start -->\s*```json\s*(.*?)\s*```\s*"
        r"<!-- capability-catalog:end -->",
        text,
        re.DOTALL,
    )
    assert match, "machine-readable capability catalog is missing"
    return json.loads(match.group(1))


catalog = load_catalog()
portable = catalog["portable_labels"]
selectors = catalog["selectors"]
invariants = catalog["invariants"]

assert catalog["estate"] == {
    "count": 1,
    "source": "canonical-estate",
    "aliases_allowed": False,
}
assert portable == {
    "os": ["os-linux", "os-macos"],
    "architecture": ["arch-x64", "arch-arm64"],
    "capability": [
        "cap-container-build",
        "cap-xcode",
        "cap-qemu-x64-fallback",
    ],
}

allowed = {label for labels in portable.values() for label in labels}
assert all(set(selector).issubset(allowed) for selector in selectors.values())
assert not {"linux", "macos", "x86_64", "container-build"} & allowed

native_x64 = set(selectors["native-linux-x64"])
fallback = set(selectors["arm64-qemu-x64-fallback"])
assert "cap-qemu-x64-fallback" in fallback
assert not set(invariants["qemu_x64_fallback_forbidden_labels"]) & fallback
assert not native_x64.issubset(fallback)

print("PASS: runner capability labels")
