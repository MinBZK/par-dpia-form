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
ASSERT_PLUGIN = CI_DIR / "assert-plugin-version.sh"
ASSERT_ABSENT = CI_DIR / "assert-tag-absent.sh"
ASSERT_PUBLICCODE = CI_DIR / "assert-publiccode-version.sh"
SET_PUBLICCODE = CI_DIR / "set-publiccode-version.sh"
NEWEST = CI_DIR / "newest-calver-tag.sh"


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


# --- assert-plugin-version.sh ----------------------------------------------


@pytest.fixture
def plugin_manifest(tmp_path: Path) -> Path:
    path = tmp_path / "plugin.json"
    path.write_text('{\n  "name": "assessments",\n  "version": "2026.6.20"\n}\n')
    return path


def test_plugin_version_matches_tag(plugin_manifest):
    assert run(ASSERT_PLUGIN, "v2026.6.20", str(plugin_manifest)).returncode == 0


def test_plugin_version_mismatch_fails(plugin_manifest):
    result = run(ASSERT_PLUGIN, "v2026.7.1", str(plugin_manifest))
    assert result.returncode != 0
    assert "2026.6.20" in result.stderr


def test_plugin_version_micro_tag(tmp_path: Path):
    path = tmp_path / "plugin.json"
    path.write_text('{"name": "assessments", "version": "2026.6.20.1"}\n')
    assert run(ASSERT_PLUGIN, "v2026.6.20.1", str(path)).returncode == 0


def test_plugin_version_missing_field_fails(tmp_path: Path):
    path = tmp_path / "plugin.json"
    path.write_text('{"name": "assessments"}\n')
    assert run(ASSERT_PLUGIN, "v2026.6.20", str(path)).returncode != 0


def test_plugin_manifest_missing_fails(tmp_path: Path):
    assert run(ASSERT_PLUGIN, "v2026.6.20", str(tmp_path / "weg.json")).returncode != 0


# --- assert-publiccode-version.sh / set-publiccode-version.sh ---------------


@pytest.fixture
def publiccode(tmp_path: Path) -> Path:
    path = tmp_path / "publiccode.yml"
    path.write_text(
        'publiccodeYmlVersion: "0.5"\n'
        "name: Invulhulp\n"
        'releaseDate: "2026-06-20"\n'
        'softwareVersion: "2026.6.20"\n'
    )
    return path


def test_publiccode_version_matches_tag(publiccode):
    assert run(ASSERT_PUBLICCODE, "v2026.6.20", str(publiccode)).returncode == 0


def test_publiccode_version_mismatch_fails(publiccode):
    result = run(ASSERT_PUBLICCODE, "v2026.7.1", str(publiccode))
    assert result.returncode != 0
    assert "softwareVersion" in result.stderr
    assert "releaseDate" in result.stderr


def test_publiccode_date_mismatch_fails(tmp_path: Path):
    # Right version, stale date: the date is not free-form under CalVer.
    path = tmp_path / "publiccode.yml"
    path.write_text('releaseDate: "2026-06-14"\nsoftwareVersion: "2026.6.20"\n')
    result = run(ASSERT_PUBLICCODE, "v2026.6.20", str(path))
    assert result.returncode != 0
    assert "releaseDate" in result.stderr


def test_publiccode_micro_tag_keeps_the_date(tmp_path: Path):
    path = tmp_path / "publiccode.yml"
    path.write_text('releaseDate: "2026-06-20"\nsoftwareVersion: "2026.6.20.1"\n')
    assert run(ASSERT_PUBLICCODE, "v2026.6.20.1", str(path)).returncode == 0


def test_publiccode_missing_field_fails(tmp_path: Path):
    path = tmp_path / "publiccode.yml"
    path.write_text('name: Invulhulp\nreleaseDate: "2026-06-20"\n')
    assert run(ASSERT_PUBLICCODE, "v2026.6.20", str(path)).returncode != 0


def test_publiccode_file_missing_fails(tmp_path: Path):
    assert run(ASSERT_PUBLICCODE, "v2026.6.20", str(tmp_path / "weg.yml")).returncode != 0


def test_publiccode_tag_without_day_fails(publiccode):
    result = run(ASSERT_PUBLICCODE, "v2026.6", str(publiccode))
    assert result.returncode != 0
    assert "CalVer" in result.stderr


def test_set_publiccode_version_satisfies_the_guard(publiccode):
    assert run(SET_PUBLICCODE, "v2026.9.5", str(publiccode)).returncode == 0
    assert 'softwareVersion: "2026.9.5"' in publiccode.read_text()
    assert 'releaseDate: "2026-09-05"' in publiccode.read_text()
    assert run(ASSERT_PUBLICCODE, "v2026.9.5", str(publiccode)).returncode == 0


def test_set_publiccode_version_needs_the_fields(tmp_path: Path):
    path = tmp_path / "publiccode.yml"
    path.write_text("name: Invulhulp\n")
    assert run(SET_PUBLICCODE, "v2026.9.5", str(path)).returncode != 0


# --- assert-tag-absent.sh --------------------------------------------------


def test_absent_tag_allowed(tagged_repo):
    assert run(ASSERT_ABSENT, "v2026.7.1", cwd=tagged_repo).returncode == 0


def test_existing_tag_blocked(tagged_repo):
    result = run(ASSERT_ABSENT, "v2026.6.10", cwd=tagged_repo)
    assert result.returncode != 0
    assert "bestaat al" in result.stderr


def test_absent_tag_is_not_fooled_by_a_prefix(tagged_repo):
    # v2026.6.6.1 exists, v2026.6.6.11 does not: no substring matching.
    assert run(ASSERT_ABSENT, "v2026.6.6.11", cwd=tagged_repo).returncode == 0


# --- newest-calver-tag.sh --------------------------------------------------


def test_newest_prints_highest_calver(tagged_repo):
    result = run(NEWEST, cwd=tagged_repo)
    assert result.returncode == 0
    assert result.stdout.strip() == "v2026.6.10"


def test_newest_ignores_semver_tags(tmp_path: Path):
    def git(*args: str):
        subprocess.run(["git", *args], cwd=tmp_path, check=True, capture_output=True)

    git("init")
    git("config", "user.email", "t@example.com")
    git("config", "user.name", "Test")
    git("commit", "--allow-empty", "-m", "init")
    git("tag", "v0.1.3")
    git("tag", "v2026.6.6")
    assert run(NEWEST, cwd=tmp_path).stdout.strip() == "v2026.6.6"


def test_newest_sorts_micro_above_base(tagged_repo):
    # v2026.6.6.1 must outrank v2026.6.6, and both stay below v2026.6.10.
    subprocess.run(
        ["git", "tag", "-d", "v2026.6.10"], cwd=tagged_repo, check=True, capture_output=True
    )
    assert run(NEWEST, cwd=tagged_repo).stdout.strip() == "v2026.6.6.1"


def test_newest_is_empty_without_calver_tags(tmp_path: Path):
    def git(*args: str):
        subprocess.run(["git", *args], cwd=tmp_path, check=True, capture_output=True)

    git("init")
    git("config", "user.email", "t@example.com")
    git("config", "user.name", "Test")
    git("commit", "--allow-empty", "-m", "init")
    result = run(NEWEST, cwd=tmp_path)
    assert result.returncode == 0
    assert result.stdout.strip() == ""
