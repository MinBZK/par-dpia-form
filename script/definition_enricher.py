#!/usr/bin/env python3

import argparse
import json
import logging
import re
import sys
from pathlib import Path
from typing import Any, Dict, List

import yaml


class DefinitionEnricher:
    def __init__(self, base_dir: Path) -> None:
        """
        Initialize enricher with base directory and logging configuration.
        
        Args:
            base_dir: Base directory of the project
        """
        self.base_dir = base_dir
        self.logger = self._setup_logger()
        self.term_dict = {}

    def _setup_logger(self) -> logging.Logger:
        """Set up logging configuration."""
        logger = logging.getLogger("DefinitionEnricher")
        logger.setLevel(logging.INFO)
        
        # Create console handler with formatting
        handler = logging.StreamHandler()
        handler.setLevel(logging.INFO)
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        
        return logger

    def load_json(self, json_path: Path) -> dict[str, Any]:
        """Load a JSON file."""
        try:
            with json_path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            self.logger.info(f"Successfully loaded JSON: {json_path}")
            return data
        except FileNotFoundError:
            self.logger.exception(f"JSON file not found: {json_path}")
            raise
        except json.JSONDecodeError:
            self.logger.exception(f"Invalid JSON in file {json_path}")
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

    def load_definitions(self, definitions_path: Path) -> None:
        """Load definitions from a YAML file and build the term dictionary."""
        try:
            definitions = self.load_yaml(definitions_path)
            
            # Create a dictionary to lookup terms - use double quotes for HTML attributes
            self.term_dict = {
                definition["term"]: (
                    f"<span class=\"aiv-definition\">"
                    f"{definition['term']}"
                    f"<span class=\"aiv-definition-text\">"
                    f"{definition['definition']}"
                    f"</span>"
                    f"</span>"
                )
                for definition in definitions["definitions"]
            }
            
            self.logger.info(f"Loaded {len(self.term_dict)} definitions")
        except Exception as e:
            self.logger.exception(f"Error loading definitions: {e}")
            raise

    def create_pattern(self, terms: List[str]) -> re.Pattern:
        """
        Create a regex pattern from a list of terms that matches only full words, including hyphens.
        """
        # Sort terms by length (descending) to match longer terms first
        sorted_terms = sorted(terms, key=len, reverse=True)
        
        # Create patterns that consider hyphens as part of words
        # Custom word boundary that treats hyphens as part of words
        # (?<![a-zA-Z0-9_-]) = negative lookbehind for word chars or hyphen
        # (?![a-zA-Z0-9_-]) = negative lookahead for word chars or hyphen
        escaped_terms = [
            r"(?<![a-zA-Z0-9_-])" + re.escape(term) + r"(?![a-zA-Z0-9_-])" 
            for term in sorted_terms
        ]
        
        # Join with OR operator
        pattern_string = "|".join(escaped_terms)
        return re.compile(pattern_string)

    def replace_terms_with_tracking(self, text: str, term_dict: Dict[str, str]) -> str:
        """
        Replace terms in text with their definitions, but only the first occurrence of each term.
        Returns the modified text with proper word boundary handling.
        """
        if not text:
            return text
                
        used_terms = set()
        result = []
        current_pos = 0
        
        # Create pattern from all available terms
        pattern = self.create_pattern(term_dict.keys())
        
        # Find all matches in the text
        for match in pattern.finditer(text):
            term = match.group(0)
            start, end = match.span()
            
            # Add text before the match
            result.append(text[current_pos:start])
            
            # If this is the first occurrence of the term, add the definition
            if term not in used_terms:
                # Use double quotes for HTML attributes for consistency
                definition_html = term_dict[term].replace("'", "\"")
                result.append(definition_html)
                used_terms.add(term)
            else:
                result.append(term)
                    
            current_pos = end
                
        # Add any remaining text
        result.append(text[current_pos:])
        return "".join(result)

    def process_question_or_conclusion(self, text: str) -> str:
        """
        Process a question or conclusion, replacing terms and returning the modified text.
        Each term will only be defined once within the given text.
        """
        if text:
            return self.replace_terms_with_tracking(text, self.term_dict)
        return text

    def enrich_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Enrich the data by replacing terms with their definitions.
        Skip the top-level tasks and only enrich subtasks.
        Returns the enriched data.
        """
        # Create a deep copy of the data to avoid modifying the original
        enriched_data = data.copy()
        
        # Process top-level tasks if they exist, starting at level 0
        if "tasks" in enriched_data:
            self._process_tasks_recursively(enriched_data["tasks"], level=0)
                    
        self.logger.info("Successfully enriched data with definitions (skipping top-level tasks)")
        return enriched_data
        
    def _process_tasks_recursively(self, tasks: List[Dict[str, Any]], level: int = 0) -> None:
        """
        Recursively process tasks and all their subtasks, enriching task and description fields.
        Skip enrichment for the first level (level=0) tasks.
        
        Args:
            tasks: List of task dictionaries to process
            level: Current nesting level (0 for top level)
        """
        if not tasks:
            return
            
        for task in tasks:
            # Process current task's text fields, but skip for level 0 (top level)
            if level > 0:
                if "task" in task:
                    task["task"] = self.process_question_or_conclusion(task["task"])
                if "description" in task:
                    task["description"] = self.process_question_or_conclusion(task["description"])
                    
            # Recursively process subtasks if present, incrementing the level
            if "tasks" in task:
                self._process_tasks_recursively(task["tasks"], level + 1)

    def enrich_and_export(self, 
                          source_path: Path, 
                          definitions_path: Path, 
                          output_path: Path) -> None:
        """
        Main processing function that enriches data and exports to JSON.
        """
        try:
            # Step 1: Load definitions
            self.load_definitions(definitions_path)
            
            # Step 2: Load source file (can be JSON or YAML)
            if source_path.suffix.lower() in ['.yaml', '.yml']:
                source_data = self.load_yaml(source_path)
            else:
                source_data = self.load_json(source_path)
            
            # Step 3: Enrich the data with definitions
            enriched_data = self.enrich_data(source_data)
            
            # Step 4: Save the enriched data to JSON
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with output_path.open("w", encoding="utf-8") as f:
                json.dump(enriched_data, f, indent=4)
                
            self.logger.info(f"Successfully exported enriched data to {output_path}")
                
        except Exception as e:
            self.logger.exception(f"Error in processing: {e}")
            raise


def main() -> None:
    # Get the script's directory and construct paths relative to it
    script_dir = Path(__file__).parent
    
    # Set up argument parser
    parser = argparse.ArgumentParser(description="Definition Enricher")
    parser.add_argument("--source", type=Path, required=True, 
                        help="Path to the source file (YAML or JSON)")
    parser.add_argument("--definitions", type=Path, required=True, 
                        help="Path to the definitions YAML file")
    parser.add_argument("--output", type=Path, required=True, 
                        help="Path to the output JSON file")
    
    args = parser.parse_args()
    
    # Initialize enricher
    enricher = DefinitionEnricher(script_dir)
    
    try:
        # Process and export
        enricher.enrich_and_export(
            args.source,
            args.definitions,
            args.output
        )
    except Exception:
        enricher.logger.exception("Processing failed")
        sys.exit(1)
        
    sys.exit(0)


if __name__ == "__main__":
    main()