#!/usr/bin/env python3
import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any

import jsonschema
import yaml
from jsonschema import validate


class SchemaValidator:
    def __init__(self, base_dir: Path) -> None:
        """
        Initialize validator with base directory and logging configuration.
        
        Args:
            base_dir: Base directory of the project
        """
        self.base_dir = base_dir
        self.logger = self._setup_logger()
        self.schemas = {}
        self.validation_results = []

    def _setup_logger(self) -> logging.Logger:
        """Set up logging configuration."""
        logger = logging.getLogger("SchemaValidator")
        logger.setLevel(logging.INFO)
        
        # Create console handler with formatting
        handler = logging.StreamHandler()
        handler.setLevel(logging.INFO)
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        
        return logger

    def load_schema(self, schema_path: Path) -> dict[str, Any]:
        """Load a JSON schema file."""
        try:
            with schema_path.open("r", encoding="utf-8") as f:
                schema = json.load(f)
            self.schemas[schema_path.stem] = schema
            self.logger.info(f"Successfully loaded schema: {schema_path}")
            return schema
        except FileNotFoundError:
            self.logger.exception(f"Schema file not found: {schema_path}")
            raise
        except json.JSONDecodeError:
            self.logger.exception(f"Invalid JSON in schema file {schema_path}")
            raise

    def load_yaml(self, yaml_path: Path) -> dict[str, Any]:
        """Load a YAML file."""
        try:
            with yaml_path.open("r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
            self.logger.info(f"Successfully loaded YAML: {yaml_path}")
            return data
        except FileNotFoundError:
            self.logger.exception(f"YAML file not found: {yaml_path}")
            raise
        except yaml.YAMLError:
            self.logger.exception(f"Invalid YAML in file {yaml_path}")
            raise

    def validate_yaml(
        self, yaml_path: Path, schema_path: Path
    ) -> tuple[bool, list[str], dict[str, Any]]:
        """
        Validate a YAML file against its schema.
        
        Returns:
            Tuple containing:
            - bool: Whether validation was successful
            - list[str]: List of error messages if validation failed
            - dict[str, Any]: The loaded YAML data if validation succeeded, otherwise an empty dict
        """
        try:
            # Load schema if not already loaded
            if schema_path.stem not in self.schemas:
                schema = self.load_schema(schema_path)
            else:
                schema = self.schemas[schema_path.stem]
                
            # Load and validate YAML
            data = self.load_yaml(yaml_path)
            validate(instance=data, schema=schema)
            
            result = {
                "file": yaml_path.name,
                "schema": schema_path.name,
                "success": True,
                "errors": [],
            }
            self.validation_results.append(result)
            return True, [], data
        except jsonschema.exceptions.ValidationError as e:
            error_path = " -> ".join(str(x) for x in e.path)
            error_msg = (
                f"Validation error in {yaml_path.name} at {error_path}: {e.message}"
            )
            result = {
                "file": yaml_path.name,
                "schema": schema_path.name,
                "success": False,
                "errors": [error_msg],
            }
            self.validation_results.append(result)
            return False, [error_msg], {}
        except Exception as e:
            error_msg = f"Error validating {yaml_path.name}: {e!s}"
            result = {
                "file": yaml_path.name,
                "schema": schema_path.name,
                "success": False,
                "errors": [error_msg],
            }
            self.validation_results.append(result)
            return False, [error_msg], {}


def main() -> None:
    # Get the script's directory and construct paths relative to it
    script_dir = Path(__file__).parent
    
    # Set up argument parser
    parser = argparse.ArgumentParser(description="YAML Schema Validator")
    parser.add_argument("--schema", type=Path, required=True, 
                        help="Path to the JSON schema file")
    parser.add_argument("--source", type=Path, required=True, 
                        help="Path to the source YAML file")
    parser.add_argument("--output", type=Path, required=False, default=None,
                        help="Path to save the validated YAML as JSON")
    
    args = parser.parse_args()
    
    # Initialize validator
    validator = SchemaValidator(script_dir)
    
    try:
        # Validate YAML against schema
        is_valid, errors, data = validator.validate_yaml(args.source, args.schema)
        
        if not is_valid:
            validator.logger.error(f"Validation failed: {errors}")
            sys.exit(1)
            
        validator.logger.info(f"Successfully validated {args.source}")
        
        # Save validated data to JSON if output path is provided
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            with args.output.open("w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
            validator.logger.info(f"Saved validated data to {args.output}")
            
    except Exception:
        validator.logger.exception("Validation failed")
        sys.exit(1)
        
    sys.exit(0)


if __name__ == "__main__":
    main()