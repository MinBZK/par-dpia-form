#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path

from schema_validator import SchemaValidator
from definition_enricher import DefinitionEnricher

def main() -> None:
    """
    Main function to process DPIA files:
    1. Validate YAML against schema
    2. Enrich with definitions
    """
    # Get the script's directory
    script_dir = Path(__file__).parent
    
    # Set up argument parser
    parser = argparse.ArgumentParser(description="YAML Validator and Definition Enricher")
    parser.add_argument("--schema", type=Path, required=True,
                       help="Path to the JSON schema file")
    parser.add_argument("--source", type=Path, required=True,
                       help="Path to the source YAML file (DPIA.yaml)")
    parser.add_argument("--begrippen-yaml", type=Path, required=True,
                       help="Path to the output/existing begrippenkader YAML file")
    parser.add_argument("--output", type=Path, required=True,
                       help="Path to the final enriched output JSON file")
    parser.add_argument("--skip-validation", action="store_true",
                       help="Skip the validation step")
    
    args = parser.parse_args()
    
    try:
        validated_data = None
        
        # Step 1: Validate YAML against schema (unless skipped)
        if not args.skip_validation:
            print(f"Validating {args.source} against schema {args.schema}...")
            validator = SchemaValidator(script_dir)
            is_valid, errors, validated_data = validator.validate_yaml(
                args.source,
                args.schema
            )
            
            if not is_valid:
                print(f"Validation failed: {errors}")
                sys.exit(1)
                
            print(f"Validation successful.")
        else:
            print("Validation step skipped.")
        
        # Step 2: Enrich with definitions
        print(f"Enriching {args.source} with definitions from {args.begrippen_yaml}...")
        enricher = DefinitionEnricher(script_dir)
        enricher.enrich_and_export(
            args.source,
            args.begrippen_yaml,
            args.output
        )
        
        print(f"Successfully processed data. Output saved to {args.output}")
            
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
        
    sys.exit(0)


if __name__ == "__main__":
    main()