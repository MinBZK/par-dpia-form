#!/usr/bin/env python3
import argparse
import datetime
import json
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set


import yaml


class BegrippenkaderSynchronizator:
    def __init__(self, base_dir: Path) -> None:
        """
        Initialize synchronizator with base directory and logging configuration.
        
        Args:
            base_dir: Base directory of the project
        """
        self.base_dir = base_dir
        self.logger = self._setup_logger()

    def _setup_logger(self) -> logging.Logger:
        """Set up logging configuration."""
        logger = logging.getLogger("BegrippenkaderSynchronizator")
        logger.setLevel(logging.INFO)
        
        # Create console handler with formatting
        handler = logging.StreamHandler()
        handler.setLevel(logging.INFO)
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        
        return logger

    @staticmethod
    def create_id(term: str) -> str:
        """
        Creates an ID based on the preferred term by normalizing it:
        - Convert to lowercase
        - Replace spaces and special characters with underscores
        - Merge multiple consecutive underscores
        - Remove leading/trailing underscores
        
        Args:
            term: The term to normalize into an ID
            
        Returns:
            The normalized ID string
        """
        # Convert to lowercase
        id_str = term.lower()
        # Replace spaces and special characters with underscores
        id_str = re.sub(r"[^a-z0-9]", "_", id_str)
        # Replace multiple consecutive underscores with a single one
        id_str = re.sub(r"_+", "_", id_str)
        # Remove leading/trailing underscores
        id_str = id_str.strip("_")
        return id_str

    def validate_begrippen(self, begrippen: List[Dict[str, Any]]) -> bool:
        """
        Validate that all required fields are present in each begriff.
        
        Args:
            begrippen: List of begriff dictionaries to validate
            
        Returns:
            bool: Whether all begrippen are valid
        """
        valid = True
        for i, begriff in enumerate(begrippen):
            if "id" not in begriff:
                self.logger.error(f"Missing 'id' in begriff at index {i}")
                valid = False
            if "term" not in begriff:
                self.logger.error(f"Missing 'term' in begriff with id '{begriff.get('id', 'UNKNOWN')}'")
                valid = False
            if "category" not in begriff:
                self.logger.error(f"Missing 'category' in begriff '{begriff.get('term', begriff.get('id', 'UNKNOWN'))}'")
                valid = False
            if "definition" not in begriff:
                self.logger.error(f"Missing 'definition' in begriff '{begriff.get('term', begriff.get('id', 'UNKNOWN'))}'")
                valid = False
        return valid

    def json_to_yaml(self, json_file: Path, output_yaml_file: Path, existing_yaml_file: Optional[Path] = None) -> None:
        """
        Parse JSON file with begrippen and convert to YAML format.
        If existing_yaml_file is provided, it will merge with existing terms.
        
        Args:
            json_file: Path to the input JSON file
            output_yaml_file: Path where the output YAML will be written
            existing_yaml_file: Optional path to existing YAML file to merge with
        """
        # Read existing YAML if provided
        existing_begrippen = []
        existing_ids: Set[str] = set()
        
        if existing_yaml_file and os.path.exists(existing_yaml_file):
            try:
                with open(existing_yaml_file, 'r', encoding='utf-8') as f:
                    existing_yaml = yaml.safe_load(f)
                    if existing_yaml and 'definitions' in existing_yaml:
                        existing_begrippen = existing_yaml['definitions']
                        # Safely extract IDs using get() to avoid KeyError
                        existing_ids = {begriff.get('id') for begriff in existing_begrippen if begriff.get('id')}
                        self.logger.info(f"Loaded {len(existing_begrippen)} existing begrippen from {existing_yaml_file}")
            except yaml.YAMLError:
                self.logger.exception(f"Error parsing existing YAML file: {existing_yaml_file}")
                raise
        
        # Parse JSON file
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                try:
                    data = json.load(f)
                    self.logger.info(f"Successfully loaded JSON file: {json_file}")
                except json.JSONDecodeError as e:
                    self.logger.error(f"Error parsing JSON file: {e}")
                    raise
        except FileNotFoundError:
            self.logger.exception(f"JSON file not found: {json_file}")
            raise
        
        new_begrippen = []
        
        # Process all concepts in the @graph array
        if "@graph" in data:
            for item in data["@graph"]:
                # Skip items that are not concepts
                if "@type" not in item or "skos:Concept" not in item.get("@type", ""):
                    continue
                    
                # Extract the term (prefLabel)
                pref_label = None
                if "skos:prefLabel" in item:
                    if isinstance(item["skos:prefLabel"], dict) and "@value" in item["skos:prefLabel"]:
                        pref_label = item["skos:prefLabel"]["@value"]
                    elif isinstance(item["skos:prefLabel"], str):
                        pref_label = item["skos:prefLabel"]
                
                # If no prefLabel found, try rdfs:label
                if not pref_label and "rdfs:label" in item:
                    if isinstance(item["rdfs:label"], dict) and "@value" in item["rdfs:label"]:
                        pref_label = item["rdfs:label"]["@value"]
                    elif isinstance(item["rdfs:label"], str):
                        pref_label = item["rdfs:label"]
                
                # Skip if no label found or use ID if available
                if not pref_label:
                    if "@id" in item:
                        # Use the last part of the ID as the term
                        id_parts = str(item["@id"]).split(":")
                        pref_label = id_parts[-1]
                        self.logger.warning(f"Using ID '{pref_label}' as term for item with missing label")
                    else:
                        self.logger.warning(f"Skipping concept without label: {item.get('@id', 'UNKNOWN')}")
                        continue
                    
                # Extract definition
                definition = ""
                if "skos:definition" in item:
                    if isinstance(item["skos:definition"], dict) and "@value" in item["skos:definition"]:
                        definition = item["skos:definition"]["@value"]
                    elif isinstance(item["skos:definition"], str):
                        definition = item["skos:definition"]
                
                # Add scope notes if available
                if "skos:scopeNote" in item:
                    if isinstance(item["skos:scopeNote"], dict) and "@value" in item["skos:scopeNote"]:
                        scope_note = item["skos:scopeNote"]["@value"]
                        definition += f"\n\nToelichting: {scope_note}"
                    elif isinstance(item["skos:scopeNote"], str):
                        definition += f"\n\nToelichting: {item['skos:scopeNote']}"
                
                # Try to extract category from inScheme
                category = "00. Algemeen"  # Default category
                if "skos:inScheme" in item:
                    scheme = None
                    if isinstance(item["skos:inScheme"], dict) and "@id" in item["skos:inScheme"]:
                        scheme = item["skos:inScheme"]["@id"]
                    elif isinstance(item["skos:inScheme"], str):
                        scheme = item["skos:inScheme"]
                    
                    if scheme:
                        # Extract category from scheme URI, assuming format like "urn:name:scheme:DPIA-13.Doelbinding"
                        match = re.search(r'DPIA-(\d+\.\w+)', scheme)
                        if match:
                            category_part = match.group(1)
                            # Try to find the full category name in the graph
                            for cat_item in data["@graph"]:
                                if "@id" in cat_item and cat_item["@id"] == scheme and "rdfs:label" in cat_item:
                                    if isinstance(cat_item["rdfs:label"], str):
                                        label = cat_item["rdfs:label"]
                                        if "DPIA - " in label:
                                            category = label.split("DPIA - ")[1]
                                            break
                                        else:
                                            category = label
                                            break
                            else:
                                # If not found, use the extracted part
                                category = category_part
                
                # Create ID based on the term
                id_value = self.create_id(pref_label)
                
                # Skip if this ID already exists in the existing YAML
                if id_value in existing_ids:
                    self.logger.info(f"Skipping '{pref_label}' as it already exists in the YAML file.")
                    continue
                
                # Add examples if available
                if "skos:example" in item:
                    if isinstance(item["skos:example"], dict) and "@value" in item["skos:example"]:
                        examples = item["skos:example"]["@value"]
                        definition += f"\n\nVoorbeelden: {examples}"
                    elif isinstance(item["skos:example"], str):
                        definition += f"\n\nVoorbeelden: {item['skos:example']}"
                
                # Make sure all required fields are present
                begriff = {
                    "id": id_value,
                    "term": pref_label,  # This will never be None at this point due to earlier check
                    "category": category,
                    "definition": definition if definition else "Geen definitie beschikbaar",
                }
                
                # Debug output
                self.logger.info(f"Adding term: {pref_label}")
                
                new_begrippen.append(begriff)
        
        # Combine existing and new begrippen
        all_begrippen = existing_begrippen + new_begrippen
        
        # Sort all begrippen by ID
        all_begrippen.sort(key=lambda x: x.get("id", ""))
        
        # Create YAML structure
        if existing_yaml_file and os.path.exists(existing_yaml_file):
            # Update existing structure with new terms
            try:
                with open(existing_yaml_file, 'r', encoding='utf-8') as f:
                    begrippenkader = yaml.safe_load(f)
                begrippenkader['definitions'] = all_begrippen
            except yaml.YAMLError:
                self.logger.exception(f"Error reading existing YAML file: {existing_yaml_file}")
                raise
        else:
            # Create new structure
            begrippenkader = self.create_yaml_structure(all_begrippen)
        
        # Validate the begrippen before writing to file
        self.logger.info("Validating begrippen...")
        if self.validate_begrippen(all_begrippen):
            # Write to YAML file
            self.write_yaml_to_file(begrippenkader, output_yaml_file)
            
            self.logger.info(f"File '{output_yaml_file}' has been updated with {len(new_begrippen)} new terms.")
            self.logger.info(f"Total number of terms: {len(all_begrippen)}")
        else:
            self.logger.error("Validation failed. The YAML file was not updated.")
            raise ValueError("Begriff validation failed")

    def create_yaml_structure(self, begrippen: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Creates a YAML structure with the provided terms.
        
        Args:
            begrippen: List of begriff dictionaries
            
        Returns:
            Dict containing the complete YAML structure
        """
        return {
            "schema_version": "1.0.0",
            "name": "Begrippenkader",
            "description": "Het begrippenkader is lijst met definities van begrippen die worden gebruikt in de DPIA. Het begrippenkader is ontwikkeld door J&V. Elke term heeft een id, naam, category (vraag DPIA) en een definitie.",
            "urn": "urn:nl:dpia:3.0:begrippenkader:1.0",
            "language": "nl",
            "owners": [
                {
                    "organization": "Ministerie van BZK",
                    "name": "CIO Rijk",
                    "email": "privacy-ciorijk@minbzk.nl",
                    "role": "Privacy Officer",
                }
            ],
            "definitions": begrippen,
            "metadata": {
                "version": "1.0.0",
                "last_updated": datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
                "maintainer": "CIO Rijk",
                "language": "nl",
            },
        }

    def write_yaml_to_file(self, begrippenkader: Dict[str, Any], output_file: Path) -> None:
        """
        Writes the YAML structure to a file.
        
        Args:
            begrippenkader: Dictionary containing the YAML structure
            output_file: Path where the output YAML will be written
        """
        try:
            output_file.parent.mkdir(parents=True, exist_ok=True)
            with open(output_file, "w", encoding="utf-8") as f:
                # Add a multiline string indicator for the description (>-)
                yaml_text = yaml.dump(begrippenkader, default_flow_style=False, allow_unicode=True, sort_keys=False)
                # Manually add >- for description
                yaml_text = yaml_text.replace("description: '", "description: >-\n  ")
                f.write(yaml_text)
                
            self.logger.info(f"Successfully wrote YAML to {output_file}")
        except Exception as e:
            self.logger.exception(f"Error writing to YAML file {output_file}: {e}")
            raise


def main() -> None:
    # Get the script's directory and construct paths relative to it
    script_dir = Path(__file__).parent
    
    # Set up argument parser
    parser = argparse.ArgumentParser(description='Convert JSON to YAML begrippenkader')
    parser.add_argument('--input', type=Path, required=True, help='Input file (JSON)')
    parser.add_argument('--output', type=Path, required=True, help='Output YAML file')
    parser.add_argument('--existing', type=Path, help='Existing YAML file to merge with', default=None)
    
    args = parser.parse_args()
    
    # Initialize synchronizator
    synchronizator = BegrippenkaderSynchronizator(script_dir)
    
    try:
        # Process and export
        synchronizator.json_to_yaml(args.input, args.output, args.existing)
    except Exception:
        synchronizator.logger.exception("Processing failed")
        sys.exit(1)
        
    sys.exit(0)


if __name__ == "__main__":
    main()