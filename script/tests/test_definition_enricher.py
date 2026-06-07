"""Tests for the definition_enricher pipeline script.

Covers the core enrichment behavior:
- term injection wraps a known term with the aiv-definition span,
- case-insensitive matching for normal terms,
- all-uppercase terms (e.g. "DAT") only match uppercase occurrences,
- terms inside existing HTML tags / URLs are not enriched,
- once_per_page injects a repeated term only once per top-level deel, while
  the default mode enriches every occurrence.
"""

from definition_enricher import (
    create_term_map,
    inject_terms,
    process_dpia,
    process_tasks,
)


def make_begrippenkader(*definitions):
    """Build a minimal begrippenkader dict from (term, definition) pairs."""
    return {
        "definitions": [
            {"id": term.lower(), "term": term, "definition": defn} for term, defn in definitions
        ]
    }


# --- create_term_map -------------------------------------------------------


def test_create_term_map_lowercases_keys_and_keeps_display_term():
    term_map = create_term_map(make_begrippenkader(("Persoonsgegeven", "een gegeven")))

    assert "persoonsgegeven" in term_map
    entry = term_map["persoonsgegeven"]
    assert entry["term"] == "Persoonsgegeven"  # original capitalization preserved
    assert entry["definition"] == "een gegeven"
    assert entry["is_alternatief_term"] is False


def test_create_term_map_registers_meervoudsvormen_and_alt_spellingen():
    begrippenkader = {
        "definitions": [
            {
                "id": "persoonsgegeven",
                "term": "Persoonsgegeven",
                "definition": "een gegeven",
                "metadata": {
                    "meervoudsvormen": ["persoonsgegevens"],
                    "alternatieve_spellingen": ["persoons-gegeven"],
                },
            }
        ]
    }
    term_map = create_term_map(begrippenkader)

    assert term_map["persoonsgegevens"]["is_meervoudsvorm"] is True
    assert term_map["persoonsgegevens"]["hoofdterm"] == "Persoonsgegeven"
    assert term_map["persoons-gegeven"]["is_alternatief_spelling"] is True


# --- inject_terms: basic wrapping -----------------------------------------


def test_inject_terms_wraps_known_term_once():
    term_map = create_term_map(make_begrippenkader(("persoonsgegeven", "een gegeven")))

    result = inject_terms("Dit is een persoonsgegeven hier.", term_map)

    assert '<span class="aiv-definition">persoonsgegeven' in result
    assert "een gegeven" in result
    # Exactly one enrichment span was added.
    assert result.count('<span class="aiv-definition">') == 1


def test_inject_terms_is_case_insensitive_for_normal_terms():
    term_map = create_term_map(make_begrippenkader(("Persoonsgegeven", "een gegeven")))

    result = inject_terms("Het PERSOONSGEGEVEN telt.", term_map)

    # Matched even though the casing differs, and the original casing is kept.
    assert '<span class="aiv-definition">PERSOONSGEGEVEN' in result


def test_inject_terms_leaves_unknown_text_untouched():
    term_map = create_term_map(make_begrippenkader(("persoonsgegeven", "een gegeven")))

    original = "Hier staat niets bijzonders."
    assert inject_terms(original, term_map) == original


# --- inject_terms: all-uppercase terms ------------------------------------


def test_uppercase_term_only_matches_uppercase():
    term_map = create_term_map(make_begrippenkader(("DAT", "De Algemene Term")))

    # Uppercase occurrence IS enriched.
    upper = inject_terms("Wij gebruiken DAT systeem.", term_map)
    assert '<span class="aiv-definition">DAT' in upper

    # The common Dutch word "dat" is NOT enriched.
    lower = inject_terms("Wij weten dat dit werkt.", term_map)
    assert "aiv-definition" not in lower


# --- inject_terms: HTML / URL protection ----------------------------------


def test_inject_terms_does_not_enrich_inside_html_tag_or_url():
    term_map = create_term_map(make_begrippenkader(("dpia", "een beoordeling")))

    # The term appears inside an <a href> URL and link text.
    text = 'Zie <a href="https://example.com/dpia-info">de uitleg</a> hier.'
    result = inject_terms(text, term_map)

    # The "dpia" inside the href attribute must NOT be wrapped.
    assert "aiv-definition" not in result
    # The link is left intact.
    assert 'href="https://example.com/dpia-info"' in result


def test_inject_terms_does_not_double_wrap_existing_definition_span():
    term_map = create_term_map(make_begrippenkader(("term", "uitleg")))

    pre_enriched = (
        '<span class="aiv-definition">term<span class="aiv-definition-text">uitleg</span></span>'
    )
    result = inject_terms(pre_enriched, term_map)

    # No additional nested span was introduced.
    assert result.count('<span class="aiv-definition">') == 1


# --- once_per_page via process_tasks --------------------------------------


def _deel_with_repeated_term():
    """A single top-level deel (page) whose subtasks repeat the same term."""
    return [
        {
            "id": "1",
            "task": "Deel 1",
            "description": "Intro",
            "tasks": [
                {"id": "1.1", "task": "Een persoonsgegeven hier", "description": ""},
                {
                    "id": "1.2",
                    "task": "Nog een persoonsgegeven daar",
                    "description": "",
                },
            ],
        }
    ]


def test_once_per_page_false_enriches_every_occurrence():
    term_map = create_term_map(make_begrippenkader(("persoonsgegeven", "een gegeven")))

    result = process_tasks(_deel_with_repeated_term(), term_map, level=0, once_per_page=False)
    subtasks = result[0]["tasks"]

    assert "aiv-definition" in subtasks[0]["task"]
    assert "aiv-definition" in subtasks[1]["task"]


def test_once_per_page_true_enriches_only_first_occurrence_per_deel():
    term_map = create_term_map(make_begrippenkader(("persoonsgegeven", "een gegeven")))

    result = process_tasks(_deel_with_repeated_term(), term_map, level=0, once_per_page=True)
    subtasks = result[0]["tasks"]

    # First occurrence enriched, second left alone (same page).
    assert "aiv-definition" in subtasks[0]["task"]
    assert "aiv-definition" not in subtasks[1]["task"]


def test_once_per_page_true_resets_between_deels():
    term_map = create_term_map(make_begrippenkader(("persoonsgegeven", "een gegeven")))

    two_deels = [
        {
            "id": "1",
            "description": "Deel 1",
            "tasks": [
                {"id": "1.1", "task": "persoonsgegeven een", "description": ""},
            ],
        },
        {
            "id": "2",
            "description": "Deel 2",
            "tasks": [
                {"id": "2.1", "task": "persoonsgegeven twee", "description": ""},
            ],
        },
    ]

    result = process_tasks(two_deels, term_map, level=0, once_per_page=True)

    # Each deel starts fresh, so the term is enriched once in each.
    assert "aiv-definition" in result[0]["tasks"][0]["task"]
    assert "aiv-definition" in result[1]["tasks"][0]["task"]


def test_process_dpia_enriches_top_level_description():
    term_map = create_term_map(make_begrippenkader(("persoonsgegeven", "een gegeven")))

    dpia = {
        "name": "DPIA",
        "description": "Een persoonsgegeven in de intro.",
        "tasks": [],
    }
    result = process_dpia(dpia, term_map)

    assert "aiv-definition" in result["description"]
