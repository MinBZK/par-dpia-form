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
        """Initialize the definition enricher."""
        self.base_dir = base_dir
        self.logger = self._setup_logger()
        self.term_dict = {}

    def _setup_logger(self) -> logging.Logger:
        """Set up logging configuration."""
        logger = logging.getLogger("DefinitionEnricher")
        logger.setLevel(logging.INFO)
        
        handler = logging.StreamHandler()
        handler.setLevel(logging.INFO)
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        
        return logger

    # --- File Loading Methods ---

    def load_file(self, file_path: Path) -> dict[str, Any]:
        """Load file based on extension (YAML or JSON)."""
        if file_path.suffix.lower() in ['.yaml', '.yml']:
            return self.load_yaml(file_path)
        else:
            return self.load_json(file_path)

    def load_json(self, json_path: Path) -> dict[str, Any]:
        """Load a JSON file."""
        try:
            with json_path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            self.logger.info(f"Loaded JSON: {json_path}")
            return data
        except (FileNotFoundError, json.JSONDecodeError) as e:
            self.logger.exception(f"Error loading JSON file {json_path}: {e}")
            raise

    def load_yaml(self, yaml_path: Path) -> dict[str, Any]:
        """Load a YAML file."""
        try:
            with yaml_path.open("r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
            self.logger.info(f"Loaded YAML: {yaml_path}")
            return data
        except (FileNotFoundError, yaml.YAMLError) as e:
            self.logger.exception(f"Error loading YAML file {yaml_path}: {e}")
            raise
    

    def load_definitions(self, definitions_path: Path) -> None:
        """Load definitions and build HTML templates for each term."""
        definitions = self.load_yaml(definitions_path)
        
        # Create HTML span elements for each definition
        self.term_dict = {}
        
        for definition in definitions["definitions"]:
            term = definition["term"]
            definition_text = definition["definition"]
            
            # Check if there's metadata with a toelichting field
            toelichting = ""
            if "metadata" in definition and "toelichting" in definition["metadata"]:
                toelichting = definition["metadata"]["toelichting"]
                # Format the toelichting with a header and paragraph
                if toelichting:
                    toelichting = f"<h4>Toelichting:</h4><p>{toelichting}</p>"

            # Check if there's metadata with a toelichting field
            voorbeeld = ""
            if "metadata" in definition and "voorbeeld" in definition["metadata"]:
                voorbeeld = definition["metadata"]["voorbeeld"]
                # Format the toelichting with a header and paragraph
                if voorbeeld:
                    voorbeeld = f"<h4>Voorbeeld(en):</h4><p>{voorbeeld}</p>"


            # Create the HTML with definition and toelichting
            html_definition = (
                f'<span class="aiv-definition">'
                f'{term}'
                f'<span class="aiv-definition-text">'
                f'{definition_text}'
                f'{toelichting}'
                f'{voorbeeld}'
                f'</span>'
                f'</span>'
            )
            
            self.term_dict[term] = html_definition
        
        self.logger.info(f"Loaded {len(self.term_dict)} definitions")

    # --- Term Replacement Methods ---

    def create_pattern(self, terms: List[str]) -> re.Pattern:
        """Create regex pattern to match terms with proper word boundaries."""
        # Sort by length (descending) to match longer terms first
        sorted_terms = sorted(terms, key=len, reverse=True)
        
        # Create patterns with custom word boundaries for each term
        escaped_terms = [
            r"(?<![a-zA-Z0-9_-])" + re.escape(term) + r"(?![a-zA-Z0-9_-])" 
            for term in sorted_terms
        ]
        
        # Join patterns with OR operator
        pattern_string = "|".join(escaped_terms)
        return re.compile(pattern_string, re.IGNORECASE)  # Case-insensitive matching

    def get_term_mappings(self, terms: List[str]) -> Dict[str, str]:
        """Create mapping of plural forms to base terms for Dutch pluralization."""
        mapping = {}
        
        for term in terms:
            if not isinstance(term, str):
                continue
                
            term_lower = term.lower()
            
            # Standard Dutch plural forms
            mapping[f"{term_lower}en"] = term_lower   # Add -en
            mapping[f"{term_lower}s"] = term_lower    # Add -s
            mapping[f"{term_lower}'s"] = term_lower   # Add -'s
            mapping[f"{term_lower}n"] = term_lower   # Add n
            
            # Special case for words ending in vowel + consonant (double the consonant)
            if len(term_lower) > 1 and re.search(r'[aeiou][^aeiou]$', term_lower):
                mapping[f"{term_lower}{term_lower[-1]}en"] = term_lower
            
            # Special case for 'categorie' -> 'categorieën'
            if term_lower == "categorie betrokkenen":
                mapping["categorieën betrokkenen"] = term_lower
            elif term_lower == "categorie":
                mapping["categorieën"] = term_lower
            
            # Handle other common Dutch irregular plurals
            if term_lower.endswith("ie"):
                mapping[f"{term_lower[:-2]}ieën"] = term_lower
        
        return mapping

    def replace_terms(self, text: str) -> str:
        """Replace the first occurrence of each term with its definition."""
        if not text:
            return text
        
        # Get plural mappings and create extended term list
        plural_mapping = self.get_term_mappings(list(self.term_dict.keys()))
        all_terms = list(self.term_dict.keys()) + list(plural_mapping.keys())
        
        # Create pattern and prepare result
        pattern = self.create_pattern(all_terms)
        used_terms = set()
        result = []
        current_pos = 0
        
        # Find and replace terms
        for match in pattern.finditer(text):
            term = match.group(0)  # Original term with original capitalization
            term_lower = term.lower()
            start, end = match.span()
            
            # Add text before the match
            result.append(text[current_pos:start])
            
            # Check if this is a plural form and get base term
            base_term_lower = plural_mapping.get(term_lower, term_lower)
            
            # Get the original capitalization version from the dictionary
            original_term = None
            for dict_term in self.term_dict.keys():
                if dict_term.lower() == base_term_lower:
                    original_term = dict_term
                    break
            
            # If no match found, use the matched term
            if original_term is None:
                original_term = term
            
            # Replace first occurrence only
            if base_term_lower not in used_terms:
                try:
                    if original_term in self.term_dict:
                        # Extract the definition text
                        definition_text = ""
                        if original_term in self.term_dict:
                            html = self.term_dict[original_term]
                            # Extract definition content between tags
                            definition_start = html.find('<span class="aiv-definition-text">') + len('<span class="aiv-definition-text">')
                            definition_end = html.rfind('</span>')
                            if definition_start > 0 and definition_end > definition_start:
                                definition_text = html[definition_start:definition_end]
                        
                        # Create the HTML with the original matched term's capitalization
                        definition_html = (
                            '<span class="aiv-definition">'
                            f'{term}'  # Use the original matched text
                            '<span class="aiv-definition-text">'
                            f'{definition_text}'
                            '</span>'
                            '</span>'
                        )
                        result.append(definition_html)
                        used_terms.add(base_term_lower)
                    else:
                        result.append(term)  # Term not found in dictionary
                except (KeyError, IndexError):
                    # Handle errors gracefully
                    result.append(term)
            else:
                # Already used this term
                result.append(term)
                
            current_pos = end
            
        # Add remaining text
        result.append(text[current_pos:])
        
        return "".join(result)

    # --- Document Processing Methods ---

    def process_tasks(self, tasks: List[Dict[str, Any]], level: int = 0) -> None:
        """
        Process tasks recursively based on their level:
        - At level 0 (top level): Only process description
        - At deeper levels: Process both task and description
        - Process all options values at any level
        """
        if not tasks:
            return
            
        for task in tasks:
            # For top level (level 0), only process description
            if level == 0:
                if "description" in task and isinstance(task["description"], str):
                    task["description"] = self.replace_terms(task["description"])
            # For deeper levels, process both task and description
            else:
                if "task" in task and isinstance(task["task"], str):
                    task["task"] = self.replace_terms(task["task"])
                if "description" in task and isinstance(task["description"], str):
                    task["description"] = self.replace_terms(task["description"])
                    
            # Process options values at any level
            if "options" in task and isinstance(task["options"], list):
                for option in task["options"]:
                    if "value" in option and isinstance(option["value"], str):
                        option["value"] = self.replace_terms(option["value"])
                        
            # Recursively process subtasks with incremented level
            if "tasks" in task and isinstance(task["tasks"], list):
                self.process_tasks(task["tasks"], level + 1)

    def enrich_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Enrich data with term definitions, respecting the level structure."""
        enriched_data = data.copy()
        
        if "tasks" in enriched_data and isinstance(enriched_data["tasks"], list):
            self.process_tasks(enriched_data["tasks"], level=0)
            
        return enriched_data

    # --- Main Processing Method ---

    def enrich_and_export(self, source_path: Path, definitions_path: Path, output_path: Path) -> None:
        """Main workflow: load files, enrich content, and export result."""
        try:
            # Load definitions and source data
            self.load_definitions(definitions_path)
            source_data = self.load_file(source_path)
            
            # Enrich the data
            enriched_data = self.enrich_data(source_data)
            
            # Export to JSON
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with output_path.open("w", encoding="utf-8") as f:
                json.dump(enriched_data, f, indent=4)
                
            self.logger.info(f"Successfully exported enriched data to {output_path}")
                
        except Exception as e:
            self.logger.exception(f"Processing failed: {e}")
            raise


def main() -> None:
    script_dir = Path(__file__).parent
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="Definition Enricher")
    parser.add_argument("--source", type=Path, required=True, 
                        help="Source file (YAML or JSON)")
    parser.add_argument("--definitions", type=Path, required=True, 
                        help="Definitions YAML file")
    parser.add_argument("--output", type=Path, required=True, 
                        help="Output JSON file")
    
    args = parser.parse_args()
    
    # Run the enricher
    enricher = DefinitionEnricher(script_dir)
    
    try:
        enricher.enrich_and_export(args.source, args.definitions, args.output)
    except Exception:
        sys.exit(1)
        
    sys.exit(0)


if __name__ == "__main__":
    main()