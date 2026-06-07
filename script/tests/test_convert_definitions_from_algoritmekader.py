"""Tests for the Algoritmekader begrippenlijst markdown converter.

Only the offline parsing path is exercised (parse_markdown_definitions and the
upsert logic). The network download path is intentionally NOT tested.
"""

from convert_definitions_from_algoritmekader import (
    parse_markdown_definitions,
    read_yaml_definitions,
    upsert_definitions,
    write_yaml_definitions,
)

SAMPLE_MARKDOWN = """\
Some introductory prose that should be ignored.

*[AVG]: Algemene verordening gegevensbescherming
*[DPIA]: Data Protection Impact Assessment
*[IAMA]: Impact Assessment Mensenrechten en Algoritmes
"""


def test_parse_markdown_extracts_abbreviation_definitions():
    result = parse_markdown_definitions(SAMPLE_MARKDOWN)

    assert result == {
        "AVG": "Algemene verordening gegevensbescherming",
        "DPIA": "Data Protection Impact Assessment",
        "IAMA": "Impact Assessment Mensenrechten en Algoritmes",
    }


def test_parse_markdown_ignores_non_matching_lines():
    content = "This is just text.\nNo abbreviations here.\n# A heading\n"
    assert parse_markdown_definitions(content) == {}


def test_parse_markdown_collapses_whitespace_in_definition():
    content = "*[X]: a    definition   with\n  irregular   spacing"
    result = parse_markdown_definitions(content)
    assert result == {"X": "a definition with irregular spacing"}


def test_parse_markdown_handles_definition_spanning_until_next_entry():
    content = "*[A]: first\n*[B]: second"
    result = parse_markdown_definitions(content)
    assert result["A"] == "first"
    assert result["B"] == "second"


def test_upsert_appends_new_definitions_and_updates_existing():
    existing = [
        {"term": "AVG", "definition": "oude definitie"},
        {"term": "BIO", "definition": "Baseline Informatiebeveiliging Overheid"},
    ]
    new_defs = {
        "AVG": "Algemene verordening gegevensbescherming",  # updated
        "DPIA": "Data Protection Impact Assessment",  # new
    }

    result = upsert_definitions(existing, new_defs)

    # Order of existing entries preserved; AVG updated in place.
    assert result[0] == {
        "term": "AVG",
        "definition": "Algemene verordening gegevensbescherming",
    }
    assert result[1]["term"] == "BIO"
    # New entry appended at the end.
    assert result[-1] == {
        "term": "DPIA",
        "definition": "Data Protection Impact Assessment",
    }


def test_input_parse_path_roundtrip_via_files(tmp_path):
    """End-to-end of the --input parse path without touching the network."""
    md_file = tmp_path / "begrippenlijst.md"
    md_file.write_text(SAMPLE_MARKDOWN, encoding="utf-8")
    out_file = tmp_path / "begrippenkader-iama.yaml"

    # Simulate the offline branch of main(): read file, parse, upsert, write.
    markdown_content = md_file.read_text(encoding="utf-8")
    new_definitions = parse_markdown_definitions(markdown_content)
    existing = read_yaml_definitions(str(out_file))  # missing file -> []
    assert existing == []

    merged = upsert_definitions(existing, new_definitions)
    write_yaml_definitions(merged, str(out_file))

    # Reading it back yields the same three terms.
    written = read_yaml_definitions(str(out_file))
    terms = {entry["term"]: entry["definition"] for entry in written}
    assert terms == new_definitions
