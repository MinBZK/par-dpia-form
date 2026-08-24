#!/usr/bin/env python3
"""Guard for the generated /.well-known/security.txt file.

Renders containers/security.txt.template with dummy values the way both
consumers do (envsubst in entrypoint.sh, string substitution in
securityTxt.ts), with and without PUBLIC_HOST, then validates the result with
sectxt (https://github.com/DigitalTrustCenter/sectxt), the Digital Trust
Center's own parser.
"""

from __future__ import annotations

import logging
import re
import sys
from datetime import UTC, datetime
from pathlib import Path

from sectxt import Parser

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

TEMPLATE_REL = "containers/security.txt.template"

# Any real deployment hostname works for this guard: it only needs a
# syntactically valid origin to build a Canonical URL from.
DUMMY_CANONICAL_HOST = "https://invulhulpen.rijksapp.nl"

PLACEHOLDER_RE = re.compile(r"\$\{[A-Za-z_][A-Za-z0-9_]*\}")

# The one recommendation this file deliberately accepts. See SECURITY.md,
# "Known non-findings", for why it is not PGP-signed. Anything else must fail
# the build, otherwise this guard is a placebo.
ALLOWED_RECOMMENDATIONS = {"not_signed"}


def add_one_year(moment: datetime) -> datetime:
    """Mirrors the Containerfiles' `d.setUTCFullYear(d.getUTCFullYear() + 1)`.

    Falls forward from Feb 29 to Mar 1 in the target year, the same way that
    JS Date normalizes an invalid month/day combination.
    """
    try:
        return moment.replace(year=moment.year + 1)
    except ValueError:
        return moment.replace(month=3, day=1, year=moment.year + 1)


def dummy_expires() -> str:
    return add_one_year(datetime.now(UTC)).strftime("%Y-%m-%dT%H:%M:%SZ")


def render_template(template: str, *, canonical_host: str, expires: str) -> str:
    return template.replace("${SECURITY_TXT_CANONICAL_HOST}", canonical_host).replace(
        "${SECURITY_TXT_EXPIRES}", expires
    )


def find_leftover_placeholders(rendered: str) -> list[str]:
    return PLACEHOLDER_RE.findall(rendered)


def build_rendered_file(template: str, *, canonical_host: str, expires: str) -> str:
    """Mirrors entrypoint.sh (and the backend's securityTxt.ts): substitute
    placeholders, then drop the Canonical line entirely when canonical_host
    is empty, rather than serving an empty or half-finished value.
    """
    rendered = render_template(template, canonical_host=canonical_host, expires=expires)
    if not canonical_host:
        rendered = (
            "\n".join(line for line in rendered.splitlines() if not line.startswith("Canonical:"))
            + "\n"
        )
    return rendered


def validate(rendered: str, *, canonical_host: str) -> list[str]:
    """Returns a list of problems; empty means the rendered file passes."""
    leftover = find_leftover_placeholders(rendered)
    if leftover:
        return [f"unrendered placeholder(s) left in the template: {', '.join(leftover)}"]

    has_canonical_line = any(line.startswith("Canonical:") for line in rendered.splitlines())
    if not canonical_host and has_canonical_line:
        return ["Canonical line present despite an empty canonical host (should have been dropped)"]

    # sectxt.Parser requires bytes, not str: passing str raises a TypeError
    # deep inside its BOM detection, not a clear "expected bytes" message.
    canonical_url = f"{canonical_host}/.well-known/security.txt" if canonical_host else None
    parser = Parser(rendered.encode("utf-8"), urls=canonical_url)

    problems = []
    if not parser.is_valid():
        problems.append("sectxt reports the file as invalid")
    for error in parser.errors:
        problems.append(f"error [{error['code']}]: {error['message']}")
    for rec in parser.recommendations:
        if rec["code"] not in ALLOWED_RECOMMENDATIONS:
            problems.append(f"recommendation [{rec['code']}]: {rec['message']}")

    return problems


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    template = (root / TEMPLATE_REL).read_text(encoding="utf-8")
    expires = dummy_expires()

    scenarios = [
        ("with PUBLIC_HOST", DUMMY_CANONICAL_HOST),
        ("without PUBLIC_HOST", ""),
    ]

    all_problems: list[tuple[str, list[str]]] = []
    for label, canonical_host in scenarios:
        rendered = build_rendered_file(template, canonical_host=canonical_host, expires=expires)
        problems = validate(rendered, canonical_host=canonical_host)
        if problems:
            all_problems.append((label, problems))

    if not all_problems:
        logger.info(
            "✓ security.txt guard: %s renders to a valid security.txt, with and without "
            "PUBLIC_HOST.",
            TEMPLATE_REL,
        )
        return 0

    logger.error("✗ security.txt guard: problems in the rendered %s.\n", TEMPLATE_REL)
    for label, problems in all_problems:
        logger.error("  scenario: %s", label)
        for problem in problems:
            logger.error("    %s", problem)
    return 1


if __name__ == "__main__":
    sys.exit(main())
