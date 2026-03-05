#!/usr/bin/env python3
"""Convert definitions from the Algoritmekader begrippenlijst markdown to YAML format.

Downloads the begrippenlijst.md from the MinBZK/Algoritmekader GitHub repository
and converts the markdown abbreviation definitions (*[term]: definition) into a
YAML file compatible with the definition_enricher.py pipeline.

Usage:
    python script/convert_definitions_from_AK.py --output sources/begrippenkader-iama.yaml
    python script/convert_definitions_from_AK.py --input begrippenlijst.md --output sources/begrippenkader-iama.yaml
"""

import argparse
import re
import sys
import urllib.request
from copy import deepcopy

import yaml

BEGRIPPENLIJST_URL = "https://raw.githubusercontent.com/MinBZK/Algoritmekader/main/includes/begrippenlijst.md"


def download_begrippenlijst(url: str) -> str:
    """Download the begrippenlijst markdown from the Algoritmekader repository."""
    try:
        with urllib.request.urlopen(url) as response:
            return response.read().decode("utf-8")
    except Exception as e:
        print(f"Error downloading begrippenlijst from {url}: {e}")
        sys.exit(1)


def parse_markdown_definitions(content: str) -> dict[str, str]:
    """Parse markdown abbreviation definitions (*[term]: definition) into a dictionary."""
    definitions = {}
    pattern = r"\*\[(.*?)\]:\s*(.*?)(?=\*\[|$)"
    matches = re.finditer(pattern, content, re.DOTALL)

    for match in matches:
        term = match.group(1).strip()
        definition = match.group(2).strip()
        definition = re.sub(r"\s+", " ", definition)
        definitions[term] = definition

    return definitions


def read_yaml_definitions(file_path: str) -> list[dict[str, str]]:
    """Read existing YAML definitions file."""
    try:
        with open(file_path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
            if data and "definitions" in data:
                return data["definitions"]
    except FileNotFoundError:
        return []
    return []


def upsert_definitions(
    existing: list[dict[str, str]], new_defs: dict[str, str]
) -> list[dict[str, str]]:
    """Update existing definitions and insert new ones.

    Preserves all existing definitions and their order, only updating if new version exists.
    Appends any new definitions at the end.
    """
    result = deepcopy(existing)
    updated_terms = set()

    for i, item in enumerate(result):
        term = item["term"]
        if term in new_defs:
            if item["definition"] != new_defs[term]:
                result[i]["definition"] = new_defs[term]
                print(f"Updated definition for: {term}")
            updated_terms.add(term)

    for term, definition in new_defs.items():
        if term not in updated_terms:
            result.append({"term": term, "definition": definition})
            print(f"Added new definition for: {term}")

    return result


def write_yaml_definitions(definitions: list[dict[str, str]], output_path: str):
    """Write definitions to YAML file."""
    output_data = {"definitions": definitions}
    with open(output_path, "w", encoding="utf-8") as f:
        yaml.dump(output_data, f, allow_unicode=True, sort_keys=False, indent=2)


def main():
    parser = argparse.ArgumentParser(
        description="Convert Algoritmekader definitions from markdown to YAML format"
    )
    parser.add_argument(
        "--input",
        help="Local markdown file path (if omitted, downloads from Algoritmekader GitHub)",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Output YAML file path",
    )
    args = parser.parse_args()

    if args.input:
        try:
            with open(args.input, encoding="utf-8") as f:
                markdown_content = f.read()
        except FileNotFoundError:
            print(f"Error: Input file '{args.input}' not found")
            sys.exit(1)
    else:
        print(f"Downloading begrippenlijst from {BEGRIPPENLIJST_URL}...")
        markdown_content = download_begrippenlijst(BEGRIPPENLIJST_URL)

    new_definitions = parse_markdown_definitions(markdown_content)
    print(f"Parsed {len(new_definitions)} definitions from markdown")

    existing_definitions = read_yaml_definitions(args.output)
    if existing_definitions:
        print(
            f"Found {len(existing_definitions)} existing definitions in {args.output}"
        )

    updated_definitions = upsert_definitions(existing_definitions, new_definitions)

    write_yaml_definitions(updated_definitions, args.output)

    print(f"\nTotal definitions in output: {len(updated_definitions)}")


if __name__ == "__main__":
    main()
