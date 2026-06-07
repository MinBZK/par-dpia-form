#!/usr/bin/env python3
import argparse
import logging
import sys
from pathlib import Path

from definition_enricher import DefinitionEnricher
from generate_md_table_tasks import generate_markdown_table, process_yaml_file
from schema_validator import SchemaValidator

logger = logging.getLogger(__name__)


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
    parser = argparse.ArgumentParser(description="YAML Validator and Definition Enricher")
    parser.add_argument("--schema", type=Path, required=True, help="Path to the JSON schema file")
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
    parser.add_argument("--skip-validation", action="store_true", help="Skip the validation step")
    parser.add_argument(
        "--definitions-once-per-page",
        action="store_true",
        help="Inject each definition at most once per page (deel) instead of "
        "at every occurrence. Used for the IAMA; DPIA and pre-scan enrich every "
        "occurrence.",
    )

    args = parser.parse_args()

    try:
        # Step 1: Validate YAML against schema (unless skipped)
        if not args.skip_validation:
            logger.info("Validating %s against schema %s...", args.source, args.schema)
            validator = SchemaValidator(script_dir)
            is_valid, errors, _validated_data = validator.validate_yaml(args.source, args.schema)

            if not is_valid:
                logger.error("Validation failed: %s", errors)
                sys.exit(1)

            logger.info("Validation successful")
        else:
            logger.info("Validation step skipped.")

        # Step 2: Enrich with definitions
        logger.info("Enriching %s with definitions from %s...", args.source, args.begrippen_yaml)
        enricher = DefinitionEnricher(script_dir)
        enricher.enrich_and_export(
            args.source,
            args.begrippen_yaml,
            args.output_json,
            once_per_page=args.definitions_once_per_page,
        )

        logger.info("Successfully processed data. Output saved to %s", args.output_json)

        # Step 3: Generate questions MD file (if specified)
        if args.output_md:
            logger.info("Generating questions MD file...")

            # Process the source YAML file
            tasks, file_name = process_yaml_file(args.source)

            # Generate the markdown content
            md_content = generate_markdown_table(tasks, file_name)

            # Create output directory if it doesn't exist
            output_dir = args.output_md.parent
            if not output_dir.exists():
                output_dir.mkdir(parents=True, exist_ok=True)

            # Write the markdown content to the specified file
            with Path(args.output_md).open("w", encoding="utf-8") as f:
                f.write(md_content)

            logger.info("Questions markdown file generated: %s", args.output_md)

    except Exception as e:
        logger.error("Error: %s", e)
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
    main()
