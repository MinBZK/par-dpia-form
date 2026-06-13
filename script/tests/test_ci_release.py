"""Tests for the shared release/deploy CI scripts in ``script/ci/``.

These bash scripts are used by both ``release.yaml`` and
``deploy-productie.yaml``; testing them here (via subprocess) keeps the shared
logic — CalVer validation, changelog extraction and the downgrade guard —
covered by the normal ``pytest script/tests`` CI step, so a fix in one place
cannot silently diverge.
"""

import subprocess
from pathlib import Path

import pytest

CI_DIR = Path(__file__).resolve().parents[2] / "script" / "ci"
VALIDATE = CI_DIR / "validate-calver-tag.sh"
CHANGELOG = CI_DIR / "changelog-section.sh"
ASSERT_NEWEST = CI_DIR / "assert-newest-calver-tag.sh"


def run(script: Path, *args: str, cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bash", str(script), *args],
        capture_output=True,
        text=True,
        cwd=cwd,
    )


# --- validate-calver-tag.sh ------------------------------------------------


@pytest.mark.parametrize("tag", ["v2026.6.6", "v2026.12.31", "v2026.6.6.1", "v2027.1.9"])
def test_validate_accepts_calver(tag):
    assert run(VALIDATE, tag).returncode == 0


@pytest.mark.parametrize(
    "tag", ["v2026.06.06", "v2026.13.1", "v0.1.3", "v2026.6.32", "2026.6.6", "v2026.6"]
)
def test_validate_rejects_non_calver(tag):
    assert run(VALIDATE, tag).returncode != 0


# --- changelog-section.sh --------------------------------------------------


@pytest.fixture
def changelog(tmp_path: Path) -> Path:
    path = tmp_path / "CHANGELOG.md"
    path.write_text(
        "# Changelog\n\n"
        "## [Unreleased]\n\n* nog niets\n\n"
        "## [2026.6.13] - 2026-06-13\n\n### Toegevoegd\n* echte inhoud\n\n"
        "## [0.1.3] - 2026-06-04\n* ouder\n"
    )
    return path


def test_changelog_prints_section(changelog):
    result = run(CHANGELOG, "v2026.6.13", str(changelog))
    assert result.returncode == 0
    assert "echte inhoud" in result.stdout
    assert "ouder" not in result.stdout  # stops at the next section


def test_changelog_missing_section_fails(changelog):
    assert run(CHANGELOG, "v2026.6.14", str(changelog)).returncode != 0


def test_changelog_empty_section_fails(tmp_path):
    path = tmp_path / "CHANGELOG.md"
    path.write_text("# Changelog\n\n## [2026.7.1]\n\n## [2026.6.13]\n* inhoud\n")
    assert run(CHANGELOG, "v2026.7.1", str(path)).returncode != 0


# --- assert-newest-calver-tag.sh -------------------------------------------


@pytest.fixture
def tagged_repo(tmp_path: Path) -> Path:
    def git(*args: str):
        subprocess.run(["git", *args], cwd=tmp_path, check=True, capture_output=True)

    git("init")
    git("config", "user.email", "t@example.com")
    git("config", "user.name", "Test")
    git("commit", "--allow-empty", "-m", "init")
    for tag in ("v2026.6.6", "v2026.6.6.1", "v2026.6.10", "v0.1.3"):
        git("tag", tag)
    return tmp_path


def test_newest_tag_allowed(tagged_repo):
    assert run(ASSERT_NEWEST, "v2026.6.10", cwd=tagged_repo).returncode == 0


def test_older_tag_blocked(tagged_repo):
    # v2026.6.6.1 exists but is older than v2026.6.10 -> downgrade -> blocked.
    assert run(ASSERT_NEWEST, "v2026.6.6.1", cwd=tagged_repo).returncode != 0


def test_old_semver_tags_are_ignored(tmp_path: Path):
    def git(*args: str):
        subprocess.run(["git", *args], cwd=tmp_path, check=True, capture_output=True)

    git("init")
    git("config", "user.email", "t@example.com")
    git("config", "user.name", "Test")
    git("commit", "--allow-empty", "-m", "init")
    git("tag", "v0.1.3")
    git("tag", "v2026.6.6")
    # Only one CalVer tag; the SemVer tag must not count as "newest".
    assert run(ASSERT_NEWEST, "v2026.6.6", cwd=tmp_path).returncode == 0


def test_first_release_allowed(tmp_path: Path):
    def git(*args: str):
        subprocess.run(["git", *args], cwd=tmp_path, check=True, capture_output=True)

    git("init")
    git("config", "user.email", "t@example.com")
    git("config", "user.name", "Test")
    git("commit", "--allow-empty", "-m", "init")
    # No tags at all: the first release is always allowed.
    assert run(ASSERT_NEWEST, "v2026.6.6", cwd=tmp_path).returncode == 0
