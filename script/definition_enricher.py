#!/usr/bin/env python3
import yaml
import json
import re
import argparse
from pathlib import Path


def load_yaml(file_path):
    """Load YAML file and return its content as a dictionary."""
    try:
        with open(file_path, "r", encoding="utf-8") as file:
            return yaml.safe_load(file)
    except Exception as e:
        print(f"Fout bij het inlezen van {file_path}: {str(e)}")
        raise


def create_term_map(begrippenkader):
    """Create a map of terms to their definitions and metadata."""
    term_map = {}

    # First pass: process all main terms
    for definition in begrippenkader.get("definitions", []):
        term_id = definition.get("id", "")
        term = definition.get("term", "")
        definition_text = definition.get("definition", "")
        metadata = definition.get("metadata", {}) or {}  # Ensure metadata is a dict

        toelichting = metadata.get("toelichting", "")

        # Handle voorbeelden which could be a string or a list
        voorbeelden = metadata.get("voorbeelden", [])
        if voorbeelden is None:
            voorbeelden = []

        # Check for alternative spellings in metadata
        alt_spellingen = metadata.get("alternatieve_spellingen", [])
        if alt_spellingen is None:
            alt_spellingen = []
        if isinstance(alt_spellingen, str):
            alt_spellingen = [alt_spellingen]

        # Get plural forms (meervoudsvormen) - NEW CODE
        meervoudsvormen = metadata.get("meervoudsvormen", [])
        if meervoudsvormen is None:
            meervoudsvormen = []
        if isinstance(meervoudsvormen, str):
            meervoudsvormen = [meervoudsvormen]

        # Store main term information - use lowercase for keys
        term_info = {
            "id": term_id,
            "term": term,  # Keep original capitalization for display
            "definition": definition_text,
            "toelichting": toelichting,
            "voorbeelden": voorbeelden,
            "is_alternatief_term": False,
            "is_alternatief_spelling": False,
            "is_meervoudsvorm": False,  # NEW CODE
            "hoofdterm": None,
            "alt_type": "",
        }

        term_map[term.lower()] = term_info

        # Store plural forms with reference to main term - NEW CODE
        for meervoud in meervoudsvormen:
            if meervoud and isinstance(meervoud, str):
                term_map[meervoud.lower()] = {
                    "term": meervoud,  # Keep original capitalization for display
                    "definition": definition_text,
                    "toelichting": toelichting,
                    "voorbeelden": voorbeelden,
                    "is_alternatief_term": False,
                    "is_alternatief_spelling": False,
                    "is_meervoudsvorm": True,  # This is a plural form
                    "hoofdterm": term,
                    "alt_type": "meervoud",
                }

        # Store alternative spellings with reference to main term - use lowercase for keys
        for alt_spelling in alt_spellingen:
            if alt_spelling and isinstance(alt_spelling, str):
                term_map[alt_spelling.lower()] = {
                    "term": alt_spelling,  # Keep original capitalization for display
                    "definition": definition_text,
                    "toelichting": toelichting,
                    "voorbeelden": voorbeelden,
                    "is_alternatief_term": False,
                    "is_alternatief_spelling": True,
                    "is_meervoudsvorm": False,
                    "hoofdterm": term,
                    "alt_type": "spelling",
                }

    # Check for alternative terms section
    alt_terms = begrippenkader.get("alternative_terms", {})

    # Process alternative terms
    for item in alt_terms:
        term = item["term"]
        voorkeur_id = item["voorkeur_id"]
        # Check if main term exists in our map - use lowercase for lookup
        if isinstance(voorkeur_id, str) and voorkeur_id.lower() in term_map:
            main_term_info = term_map[voorkeur_id.lower()]
            term_map[term.lower()] = {
                "id": "",
                "term": term,  # Keep original capitalization for display
                "definition": main_term_info["definition"],
                "toelichting": main_term_info["toelichting"],
                "voorbeelden": main_term_info["voorbeelden"],
                "is_alternatief_term": True,
                "is_alternatief_spelling": False,
                "is_meervoudsvorm": False,
                "hoofdterm": main_term_info["term"],
                "alt_type": "term",
            }
    return term_map


def inject_terms(text, term_map):
    """
    Inject HTML tags around terms found in the text.
    Returns the modified text with HTML tags.

    Matching priority:
    1. Hoofdtermen (longest first)
    2. Hoofdtermen meervoudsvormen (longest first)
    3. Alternatieve spellingen (longest first)
    4. Alternatieve termen (longest first)

    All matching is case-insensitive, but original capitalization is preserved.
    Terms inside existing <span class="aiv-definition"> tags are NOT processed.
    Also prevents adding overlapping or nested tags during the same processing run.
    """
    if not text or not isinstance(text, str):
        return text

    # Group terms by type
    hoofdtermen = []
    meervoudsvormen = []  # NEW: separate list for plural forms
    alt_spellingen = []
    alt_termen = []

    for term_key, term_data in term_map.items():
        # Term keys are already lowercase from create_term_map
        if term_data.get("is_meervoudsvorm", False):  # NEW: check for plural forms
            meervoudsvormen.append(term_key)
        elif term_data.get("is_alternatief_spelling", False):
            alt_spellingen.append(term_key)
        elif term_data.get("is_alternatief_term", False):
            alt_termen.append(term_key)
        else:
            hoofdtermen.append(term_key)

    # Sort each category by length (longest first)
    hoofdtermen.sort(key=len, reverse=True)
    meervoudsvormen.sort(key=len, reverse=True)  # NEW: sort plural forms
    alt_spellingen.sort(key=len, reverse=True)
    alt_termen.sort(key=len, reverse=True)

    # Combine all term lists in processing order with the new priority
    all_term_lists = [
        hoofdtermen,
        meervoudsvormen,
        alt_spellingen,
        alt_termen,
    ]  # Updated order

    # Create a record of all matched positions to prevent overlapping/nested tags
    matched_positions = set()

    # Create an array of characters to be modified
    # This approach allows us to mark positions as "processed" to avoid overlapping tags
    chars = list(text)

    # Find all existing aiv-definition spans first and mark their positions as matched
    span_pattern = r'<span class="aiv-definition">.*?</span></span>'
    for match in re.finditer(span_pattern, text, re.DOTALL):
        start, end = match.span()
        # Mark all positions in this span as already matched
        for pos in range(start, end):
            matched_positions.add(pos)

    # Process each term list in order
    for term_list_index, term_list in enumerate(all_term_lists):
        if not term_list:
            continue

        # Process each term in the current list
        for term in term_list:
            # Create pattern for this specific term with word boundaries
            term_pattern = r"\b" + re.escape(term) + r"\b"

            # Find all matches for this term in the current state of the text
            current_text = "".join(chars)
            for match in re.finditer(term_pattern, current_text, re.IGNORECASE):
                start, end = match.span()

                # Skip if any part of this match overlaps with positions already matched
                overlap = False
                for pos in range(start, end):
                    if pos in matched_positions:
                        overlap = True
                        break

                if overlap:
                    continue

                # This is a valid match that doesn't overlap with existing spans
                matched_text = current_text[start:end]
                term_lower = matched_text.lower()

                # Get the term data
                term_data = term_map.get(term_lower)
                if not term_data:
                    # Try again with case-insensitive lookup
                    for key in term_map:
                        if key.lower() == term_lower:
                            term_data = term_map[key]
                            break

                if not term_data:
                    continue

                # Create the HTML with the original matched text
                term_html = f'<span class="aiv-definition">{matched_text}<span class="aiv-definition-text">{term_data["definition"]}'

                # Add toelichting if available
                toelichting = term_data.get("toelichting", "")
                if toelichting:
                    term_html += f"\n<br><strong>Toelichting</strong>: {toelichting}"

                # Add voorbeelden if available
                voorbeelden = term_data.get("voorbeelden", [])
                if voorbeelden:
                    if isinstance(voorbeelden, list):
                        voorbeelden_text = "; ".join(voorbeelden)
                        term_html += (
                            f"\n<br><strong>Voorbeeld(en)</strong>: {voorbeelden_text}"
                        )
                    elif isinstance(voorbeelden, str):
                        term_html += (
                            f"\n<br><strong>Voorbeeld(en)</strong>: {voorbeelden}"
                        )

                # Add alternative term information
                if term_data.get("is_alternatief_term", False) and term_data.get(
                    "hoofdterm"
                ):
                    term_html += f"\n<br><i>Dit is een alternatieve term van {term_data.get('hoofdterm')}</i>"

                if term_data.get("is_alternatief_spelling", False) and term_data.get(
                    "hoofdterm"
                ):
                    term_html += f"\n<br><i>Dit is een alternatieve spelling van {term_data.get('hoofdterm')}</i>"

                # Add plural form information - NEW CODE
                if term_data.get("is_meervoudsvorm", False) and term_data.get(
                    "hoofdterm"
                ):
                    term_html += f"\n<br><i>Dit is een meervoudsvorm van {term_data.get('hoofdterm')}</i>"

                term_html += "</span></span>"

                # Replace the matched text with the HTML in chars list
                chars[start:end] = list(term_html)

                # Mark these positions as matched
                for i in range(start, start + len(term_html)):
                    matched_positions.add(i)

                # Update the text based on the current state of chars
                current_text = "".join(chars)

                # We need to re-find all spans after this replacement
                # to properly update matched_positions for the next iterations
                updated_matched_positions = set()
                for span_match in re.finditer(span_pattern, current_text, re.DOTALL):
                    s, e = span_match.span()
                    for pos in range(s, e):
                        updated_matched_positions.add(pos)

                # Add the original matched positions that weren't part of spans
                for pos in matched_positions:
                    if pos < start or pos >= start + len(term_html):
                        updated_matched_positions.add(pos)

                # Update with the new positions
                matched_positions = updated_matched_positions
                chars = list(current_text)

    # Return the final text with all replacements
    return "".join(chars)


def process_dpia(dpia_data, term_map):
    """Process the DPIA data and inject terms from the begrippenkader.

    Handles main structure elements and delegates to process_tasks for handling tasks.
    """
    if not dpia_data:
        return dpia_data

    # Create a deep copy of the data to avoid modifying the original
    result = {}

    # Process top-level fields
    for key, value in dpia_data.items():
        if key == "description" and isinstance(value, str):
            result[key] = inject_terms(value, term_map)
        elif key == "tasks" and isinstance(value, list):
            # Process tasks with level 0
            result[key] = process_tasks(value, term_map, level=0)
        else:
            result[key] = value

    return result


def process_tasks(tasks, term_map, level=0):
    """
    Process tasks recursively based on their level:
    - At level 0 (top level): Only process description
    - At deeper levels: Process both task and description
    - Process options values only for checkbox_option type tasks

    Args:
        tasks: List of task dictionaries
        term_map: Dictionary mapping terms to their definitions
        level: Current nesting level of tasks (0 for top level)

    Returns:
        Processed list of tasks with terms injected according to rules
    """
    if not tasks:
        return tasks

    result = []

    for task in tasks:
        # Create a copy of the task to modify
        task_copy = task.copy()

        # For top level (level 0), only process description
        if level == 0:
            if "description" in task_copy and isinstance(task_copy["description"], str):
                task_copy["description"] = inject_terms(
                    task_copy["description"], term_map
                )
        # For deeper levels, process both task and description
        else:
            if "task" in task_copy and isinstance(task_copy["task"], str):
                task_copy["task"] = inject_terms(task_copy["task"], term_map)
            if "description" in task_copy and isinstance(task_copy["description"], str):
                task_copy["description"] = inject_terms(
                    task_copy["description"], term_map
                )

        # Process options values for both checkbox_option and radio_option type tasks
        task_type = task_copy.get("type", [])
        # Handle both string and list types
        if isinstance(task_type, str):
            is_option_task = task_type in ["checkbox_option", "radio_option"]
        elif isinstance(task_type, list):
            is_option_task = any(
                t in ["checkbox_option", "radio_option"] for t in task_type
            )
        else:
            is_option_task = False

        if (
            is_option_task
            and "options" in task_copy
            and isinstance(task_copy["options"], list)
        ):
            options_copy = []
            for option in task_copy["options"]:
                option_copy = option.copy()
                if "value" in option_copy and isinstance(option_copy["value"], str):
                    option_copy["value"] = inject_terms(option_copy["value"], term_map)
                # Process label if it exists and is a string
                if "label" in option_copy and isinstance(option_copy["label"], str):
                    option_copy["label"] = inject_terms(option_copy["label"], term_map)
                options_copy.append(option_copy)
            task_copy["options"] = options_copy

        # Process dependencies with 'contains' operator
        if "dependencies" in task_copy and isinstance(task_copy["dependencies"], list):
            dependencies_copy = []
            for dependency in task_copy["dependencies"]:
                dependency_copy = dependency.copy()
                if (
                    isinstance(dependency_copy, dict)
                    and dependency_copy.get("type") == "conditional"
                    and dependency_copy.get("condition", {}).get("operator")
                    == "contains"
                ):
                    # Include the value in the processing if it exists
                    condition = dependency_copy.get("condition", {}).copy()
                    value = condition.get("value")
                    if isinstance(value, str):
                        # Process the value using inject_terms
                        replaced_value = inject_terms(value, term_map)
                        condition["value"] = replaced_value.strip("'")
                        dependency_copy["condition"] = condition
                dependencies_copy.append(dependency_copy)
            task_copy["dependencies"] = dependencies_copy

        # Recursively process subtasks with incremented level
        if "tasks" in task_copy and isinstance(task_copy["tasks"], list):
            task_copy["tasks"] = process_tasks(task_copy["tasks"], term_map, level + 1)

        result.append(task_copy)

    return result


# Add the DefinitionEnricher class here
class DefinitionEnricher:
    """
    A class to enrich DPIA YAML files with definitions from a begrippenkader.
    """

    def __init__(self, script_dir=None):
        """
        Initialize the DefinitionEnricher.

        Args:
            script_dir: Path object for the script directory
        """
        self.script_dir = script_dir if script_dir else Path(__file__).parent

    def enrich_and_export(self, source_path, begrippen_yaml_path, output_path):
        """
        Enrich a DPIA YAML file with definitions and export as JSON.

        Args:
            source_path: Path to the source YAML file
            begrippen_yaml_path: Path to the begrippenkader YAML file
            output_path: Path to write the enriched JSON output

        Returns:
            None
        """
        # Ensure output directory exists
        output_dir = Path(output_path).parent
        if not output_dir.exists():
            output_dir.mkdir(parents=True, exist_ok=True)
            print(f"Output directory created: {output_dir}")

        # Load the YAML files
        print(f"Reading input YAML from: {source_path}")
        dpia_data = load_yaml(source_path)

        print(f"Reading begrippenkader from: {begrippen_yaml_path}")
        begrippenkader_data = load_yaml(begrippen_yaml_path)

        print("YAML files successfully loaded.")

        # Create a map of terms to their definitions
        term_map = create_term_map(begrippenkader_data)

        # Count terms by category for logging
        hoofdtermen = []
        alt_spellingen = []
        alt_termen = []

        for term_key, term_data in term_map.items():
            if term_data.get("is_alternatief_spelling", False):
                alt_spellingen.append(term_key)
            elif term_data.get("is_alternatief_term", False):
                alt_termen.append(term_key)
            else:
                hoofdtermen.append(term_key)

        # Determine if it's a DPIA or PreScan based on the filename
        file_type = "PrescanDPIA" if "prescan" in str(source_path).lower() else "DPIA"
        print(f"Processing {file_type} data...")

        # Process the DPIA data and inject terms
        processed_dpia = process_dpia(dpia_data, term_map)

        print(f"{file_type} data processed and terms injected.")

        # Convert to JSON
        json_output = json.dumps(processed_dpia, indent=2, ensure_ascii=False)

        # Write the output to a file
        print(f"Writing output to: {output_path}")
        with open(output_path, "w", encoding="utf-8") as file:
            file.write(json_output)

        print(f"Successfully enriched and exported to: {output_path}")

        return processed_dpia


def main():
    # Set up argument parser for custom paths with new parameter names
    parser = argparse.ArgumentParser(
        description="Converteer DPIA.yaml of prescan_DPIA.yaml naar JSON met begrippenkader injecties."
    )
    parser.add_argument(
        "--source",
        required=True,
        help="Pad naar bron YAML bestand (DPIA.yaml of prescan_DPIA.yaml)",
    )
    parser.add_argument(
        "--definitions", required=True, help="Pad naar begrippenkader-dpia.yaml bestand"
    )
    parser.add_argument("--output", required=True, help="Pad naar output JSON bestand")
    args = parser.parse_args()

    try:
        # Create a DefinitionEnricher instance and use it
        enricher = DefinitionEnricher()
        enricher.enrich_and_export(args.source, args.definitions, args.output)

    except Exception as e:
        print(f"Er is een fout opgetreden: {str(e)}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    print("DPIA/PreScan YAML naar JSON Converter met Begrippenkader")
    print("=======================================================")
    print("Dit script zet YAML bestanden om naar JSON en injecteert termen")
    print("uit het begrippenkader met HTML-tags voor definities.")
    print("")
    print("Prioriteit van term-matching:")
    print("1. Hoofdtermen (langste eerst)")
    print("2. Alternatieve spellingen (langste eerst)")
    print("3. Alternatieve termen (langste eerst)")
    print("")
    print("Alle matching gebeurt hoofdletter-ongevoelig, maar de oorspronkelijke")
    print("hoofdletters in de tekst blijven behouden.")
    print("")
    print('Termen binnen bestaande <span class="aiv-definition"> tags worden')
    print("overgeslagen om te voorkomen dat er geneste definitie-spans ontstaan.")
    print("")
    print("Gebruik:")
    print("  --source [PATH]          Pad naar bron YAML bestand")
    print("  --definitions [PATH]     Pad naar begrippenkader-dpia.yaml")
    print("  --output [PATH]          Pad naar output JSON bestand")
    print("")

    main()
