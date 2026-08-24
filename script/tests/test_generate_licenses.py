"""Tests for ``script/generate_licenses.py``."""

import io
import json

import generate_licenses
import pytest

SAMPLE = {
    "MIT": [
        {"name": "vue", "versions": ["3.5.41"]},
        {"name": "@esbuild/darwin-arm64", "versions": ["0.28.2"]},
        {"name": "@rollup/rollup-linux-x64-gnu", "versions": ["4.59.0"]},
        {"name": "lightningcss-darwin-arm64", "versions": ["1.30.2"]},
        {"name": "fsevents", "versions": ["2.3.3"]},
        {"name": "abort-controller", "versions": ["3.0.0"]},
    ],
    "Apache-2.0": [{"name": "@swc/helpers", "versions": ["0.5.23"]}],
}


def test_platform_binaries_are_left_out():
    output = generate_licenses.render(SAMPLE)

    assert "vue@3.5.41" in output
    assert "darwin" not in output.split("Licenties van gebruikte bibliotheken")[1]
    assert "rollup-linux-x64-gnu" not in output


def test_platform_only_packages_without_a_telling_name_are_left_out():
    output = generate_licenses.render(SAMPLE)

    assert "fsevents" not in output


def test_packages_are_sorted_case_insensitively():
    output = generate_licenses.render(SAMPLE)
    body = output.split("=====================================\n")[1]
    names = [line.split("@")[0] or "@" for line in body.splitlines() if "[license(s):" in line]

    assert names == sorted(names, key=str.lower)


def test_summary_lists_every_used_license():
    output = generate_licenses.render(SAMPLE)

    assert output.rstrip().endswith("LICENSES: Apache-2.0, MIT")


def test_missing_version_does_not_crash():
    output = generate_licenses.render({"MIT": [{"name": "mystery"}]})

    assert "mystery@?" in output


def run_main(monkeypatch, tmp_path, argv, data=SAMPLE):
    target = tmp_path / "third-party-licenses.txt"
    monkeypatch.setattr(generate_licenses, "OUTPUT", target)
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(data)))
    monkeypatch.setattr("sys.argv", ["generate_licenses.py", *argv])
    generate_licenses.main()
    return target


def test_write_then_check_is_clean(monkeypatch, tmp_path):
    target = run_main(monkeypatch, tmp_path, [])

    assert target.read_text() == generate_licenses.render(SAMPLE)

    run_main(monkeypatch, tmp_path, ["--check"])


def test_check_fails_on_a_stale_file(monkeypatch, tmp_path, caplog):
    target = run_main(monkeypatch, tmp_path, [])
    target.write_text(target.read_text() + "een package dat er niet meer is\n")

    with pytest.raises(SystemExit) as exit_info:
        run_main(monkeypatch, tmp_path, ["--check"])

    assert exit_info.value.code == 1
    assert "-een package dat er niet meer is" in caplog.text


def test_check_fails_when_the_file_is_missing(monkeypatch, tmp_path):
    with pytest.raises(SystemExit) as exit_info:
        run_main(monkeypatch, tmp_path, ["--check"])

    assert exit_info.value.code == 1


def test_check_does_not_write(monkeypatch, tmp_path):
    target = run_main(monkeypatch, tmp_path, [])
    target.write_text("verouderd\n")

    with pytest.raises(SystemExit):
        run_main(monkeypatch, tmp_path, ["--check"])

    assert target.read_text() == "verouderd\n"
