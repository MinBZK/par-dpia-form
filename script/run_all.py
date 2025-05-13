#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path

from schema_validator import SchemaValidator
from definition_enricher import DefinitionEnricher
from generate_md_table_questions import process_yaml_file, generate_markdown_table


def main() -> None:
    """
    Main function to process DPIA files:
    1. Validate YAML against schema
    2. Enrich with definitions
    3. Generate questions MD file
    """
    # Get the script's directory
    script_dir = Path(__file__).parent

    # Set up argument parser
    parser = argparse.ArgumentParser(
        description="YAML Validator and Definition Enricher"
    )
    parser.add_argument(
        "--schema", type=Path, required=True, help="Path to the JSON schema file"
    )
    parser.add_argument(
        "--source",
        type=Path,
        required=True,
        help="Path to the source YAML file (DPIA.yaml)",
    )
    parser.add_argument(
        "--begrippen-yaml",
        type=Path,
        required=True,
        help="Path to the output/existing begrippenkader YAML file",
    )
    parser.add_argument(
        "--output-json",
        type=Path,
        required=True,
        help="Path to the final enriched output JSON file",
    )
    parser.add_argument(
        "--output-md",
        type=Path,
        required=False,
        help="Path to the questions output Markdown file",
    )
    parser.add_argument(
        "--skip-validation", action="store_true", help="Skip the validation step"
    )

    args = parser.parse_args()

    try:
        validated_data = None

        # Step 1: Validate YAML against schema (unless skipped)
        if not args.skip_validation:
            print(f"Validating {args.source} against schema {args.schema}...")
            validator = SchemaValidator(script_dir)
            is_valid, errors, validated_data = validator.validate_yaml(
                args.source, args.schema
            )

            if not is_valid:
                print(f"Validation failed: {errors}")
                sys.exit(1)

            print("Validation successful")
        else:
            print("Validation step skipped.")

        # Step 2: Enrich with definitions
        print(f"Enriching {args.source} with definitions from {args.begrippen_yaml}...")
        enricher = DefinitionEnricher(script_dir)
        enricher.enrich_and_export(args.source, args.begrippen_yaml, args.output_json)

        print(f"Successfully processed data. Output saved to {args.output_json}")

        # Step 3: Generate questions MD file (if specified)
        if args.output_md:
            print("Generating questions MD file...")

            # Process the source YAML file
            tasks, file_name = process_yaml_file(args.source)

            # Generate the markdown content
            md_content = generate_markdown_table(tasks, file_name)

            # Create output directory if it doesn't exist
            output_dir = args.output_md.parent
            if not output_dir.exists():
                output_dir.mkdir(parents=True, exist_ok=True)

            # Write the markdown content to the specified file
            with open(args.output_md, "w", encoding="utf-8") as f:
                f.write(md_content)

            print(f"Questions markdown file generated: {args.output_md}")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
