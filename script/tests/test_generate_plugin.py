"""Tests for the assessments plugin manifest generator.

``.plugin/plugin.json`` is the single source of truth; the Claude Code and
Cursor manifests are generated from it. ``--set-version`` is what the release
PR runs to line the plugin up with the CalVer tag, so it has to keep all three
files in sync in one go.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
PLUGIN_DIR = REPO_ROOT / ".claude" / "plugins" / "assessments"
GENERATOR = PLUGIN_DIR / "scripts" / "generate_plugin.py"


def run(*args: str, cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(cwd / "scripts" / "generate_plugin.py"), *args],
        capture_output=True,
        text=True,
    )


@pytest.fixture
def plugin_copy(tmp_path: Path) -> Path:
    """A throwaway plugin tree so tests never rewrite the real manifests."""
    root = tmp_path / "assessments"
    (root / "scripts").mkdir(parents=True)
    (root / ".plugin").mkdir()
    (root / "scripts" / "generate_plugin.py").write_text(GENERATOR.read_text())
    (root / ".plugin" / "plugin.json").write_text(
        json.dumps({"name": "assessments", "description": "test", "version": "0.1.0"}, indent=2)
        + "\n"
    )
    return root


def read(path: Path) -> dict:
    return json.loads(path.read_text())


def test_set_version_updates_source_and_platforms(plugin_copy):
    assert run("--set-version", "2026.6.20", cwd=plugin_copy).returncode == 0

    assert read(plugin_copy / ".plugin" / "plugin.json")["version"] == "2026.6.20"
    assert read(plugin_copy / ".claude-plugin" / "plugin.json")["version"] == "2026.6.20"
    assert read(plugin_copy / ".cursor-plugin" / "plugin.json")["version"] == "2026.6.20"


def test_set_version_leaves_check_green(plugin_copy):
    run("--set-version", "2026.6.20", cwd=plugin_copy)
    assert run("--check", cwd=plugin_copy).returncode == 0


def test_set_version_keeps_key_order(plugin_copy):
    run("--set-version", "2026.6.20", cwd=plugin_copy)
    source = plugin_copy / ".plugin" / "plugin.json"
    assert list(read(source)) == ["name", "description", "version"]


def test_set_version_requires_a_value(plugin_copy):
    assert run("--set-version", cwd=plugin_copy).returncode != 0


def test_check_detects_drift(plugin_copy):
    run(cwd=plugin_copy)
    target = plugin_copy / ".claude-plugin" / "plugin.json"
    target.write_text(json.dumps({"name": "assessments", "version": "9.9.9"}) + "\n")
    assert run("--check", cwd=plugin_copy).returncode != 0
