from datetime import UTC, datetime
from pathlib import Path

import pytest
from check_securitytxt import (
    TEMPLATE_REL,
    build_rendered_file,
    dummy_expires,
    find_leftover_placeholders,
    render_template,
    validate,
)
from sectxt import Parser

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def real_template() -> str:
    return (REPO_ROOT / TEMPLATE_REL).read_text(encoding="utf-8")


# The gotcha this whole guard exists to avoid tripping over: sectxt.Parser
# wants bytes, and a str raises deep inside its BOM detection rather than a
# clear "expected bytes" message.
def test_sectxt_parser_rejects_str_content():
    with pytest.raises(TypeError):
        Parser("Expires: 2099-01-01T00:00:00Z\n")


def test_render_template_substitutes_both_placeholders():
    rendered = render_template(
        "Expires: ${SECURITY_TXT_EXPIRES}\nCanonical: ${SECURITY_TXT_CANONICAL_HOST}/x\n",
        canonical_host="https://example.nl",
        expires="2099-01-01T00:00:00Z",
    )
    assert rendered == "Expires: 2099-01-01T00:00:00Z\nCanonical: https://example.nl/x\n"


def test_find_leftover_placeholders_catches_a_renamed_variable():
    # Simulates entrypoint.sh exporting a differently-named variable after a
    # rename that the template was not updated for.
    rendered = render_template(
        "Expires: ${SECURITY_TXT_EXPIRES}\nCanonical: ${RENAMED_HOST}/x\n",
        canonical_host="https://example.nl",
        expires="2099-01-01T00:00:00Z",
    )
    assert find_leftover_placeholders(rendered) == ["${RENAMED_HOST}"]


def test_dummy_expires_is_about_a_year_out():
    expires = dummy_expires()
    parsed = datetime.strptime(expires, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
    delta_days = (parsed - datetime.now(UTC)).days
    assert 360 <= delta_days <= 366


# Mirrors entrypoint.sh: an empty canonical host must drop the Canonical line
# entirely, not serve it empty or half-finished.
def test_build_rendered_file_drops_canonical_when_host_is_empty():
    rendered = build_rendered_file(
        "Expires: ${SECURITY_TXT_EXPIRES}\n"
        "Canonical: ${SECURITY_TXT_CANONICAL_HOST}/.well-known/security.txt\n"
        "Contact: mailto:security@ncsc.nl\n",
        canonical_host="",
        expires="2099-01-01T00:00:00Z",
    )
    assert "Canonical" not in rendered
    assert "${" not in rendered


def test_build_rendered_file_keeps_canonical_when_host_is_set():
    rendered = build_rendered_file(
        "Expires: ${SECURITY_TXT_EXPIRES}\n"
        "Canonical: ${SECURITY_TXT_CANONICAL_HOST}/.well-known/security.txt\n",
        canonical_host="https://example.nl",
        expires="2099-01-01T00:00:00Z",
    )
    assert rendered == (
        "Expires: 2099-01-01T00:00:00Z\nCanonical: https://example.nl/.well-known/security.txt\n"
    )


# The actual template, rendered the way both consumers render it, must pass
# with only the one allowlisted recommendation (not_signed, see SECURITY.md
# "Known non-findings").
def test_current_template_renders_to_a_valid_security_txt_with_public_host():
    rendered = build_rendered_file(
        real_template(), canonical_host="https://invulhulpen.rijksapp.nl", expires=dummy_expires()
    )
    assert find_leftover_placeholders(rendered) == []
    problems = validate(rendered, canonical_host="https://invulhulpen.rijksapp.nl")
    assert problems == []


# Second real scenario: PUBLIC_HOST unset (local build, or ZAD injection ever
# failing). Must still be a valid file, with Canonical simply absent.
def test_current_template_renders_to_a_valid_security_txt_without_public_host():
    rendered = build_rendered_file(real_template(), canonical_host="", expires=dummy_expires())
    assert find_leftover_placeholders(rendered) == []
    assert not any(line.startswith("Canonical:") for line in rendered.splitlines())
    problems = validate(rendered, canonical_host="")
    assert problems == []


# Proves the guard actually catches something: RFC 9116 requires Expires, so
# dropping the line must fail validation.
def test_missing_expires_field_fails_validation():
    rendered = build_rendered_file(
        real_template(), canonical_host="https://invulhulpen.rijksapp.nl", expires=dummy_expires()
    )
    without_expires = "\n".join(
        line for line in rendered.splitlines() if not line.startswith("Expires:")
    )
    problems = validate(without_expires, canonical_host="https://invulhulpen.rijksapp.nl")
    assert problems != []


# A recommendation other than not_signed must not be silently allowed through,
# otherwise the allowlist is a placebo.
def test_new_recommendation_is_not_silently_allowed():
    minimal = (
        f"Expires: {dummy_expires()}\n"
        "Canonical: https://invulhulpen.rijksapp.nl/.well-known/security.txt\n"
        "Contact: mailto:security@ncsc.nl\n"
    )
    problems = validate(minimal, canonical_host="https://invulhulpen.rijksapp.nl")
    assert any("no_encryption" in problem for problem in problems)


# A stray Canonical line surviving despite an empty host would mean the
# strip logic broke; the guard must catch that rather than pass it through
# to sectxt (which cannot tell a leftover line from a deliberate one).
def test_validate_flags_a_stray_canonical_line_with_empty_host():
    rendered = (
        f"Expires: {dummy_expires()}\n"
        "Canonical: /.well-known/security.txt\n"
        "Contact: mailto:security@ncsc.nl\n"
    )
    problems = validate(rendered, canonical_host="")
    assert any("Canonical line present" in problem for problem in problems)
