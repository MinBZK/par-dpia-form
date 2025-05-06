#!/usr/bin/env python3

import argparse
import json
import logging
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple, Optional


import yaml


class CaseInsensitiveDict(dict):
    """Dictionary that is case-insensitive for string keys."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._key_map = {}  # maps lowercase key to original key
        self._refresh_key_map()
        
    def _refresh_key_map(self):
        self._key_map = {k.lower() if isinstance(k, str) else k: k for k in super().keys()}
        
    def __getitem__(self, key):
        if isinstance(key, str):
            return super().__getitem__(self._key_map.get(key.lower(), key))
        return super().__getitem__(key)
        
    def __setitem__(self, key, value):
        if isinstance(key, str):
            self._key_map[key.lower()] = key
        super().__setitem__(key, value)
        
    def __contains__(self, key):
        if isinstance(key, str):
            return key.lower() in self._key_map
        return super().__contains__(key)
    
    def get(self, key, default=None):
        if isinstance(key, str):
            return super().get(self._key_map.get(key.lower(), key), default)
        return super().get(key, default)


class TermTrie:
    """
    A trie data structure for efficient term matching with support for word boundaries.
    Provides better performance than regex for large term sets.
    """
    def __init__(self):
        self.root = {}
        self.term_end = "_end_"
        
    def add_term(self, term: str, data: Any) -> None:
        """
        Add a term to the trie with associated data.
        
        Args:
            term: The term to add
            data: Data to associate with this term
        """
        node = self.root
        term_lower = term.lower()  # Store lowercase version for case-insensitive matching
        
        for char in term_lower:
            if char not in node:
                node[char] = {}
            node = node[char]
        
        # Mark end of term and store data
        node[self.term_end] = {
            "term": term,  # Original term with capitalization
            "data": data   # Associated data
        }
        
    def find_matches(self, text: str) -> List[Tuple[str, Any, int, int]]:
        """
        Find all possible term matches in the text with word boundary checks.
        Returns list of tuples: (matched_term, term_data, start_pos, end_pos)
        
        Args:
            text: The text to search in
            
        Returns:
            List of matches with position information
        """
        matches = []
        text_lower = text.lower()
        
        # For each starting position in the text
        for i in range(len(text)):
            # Check if we're at a potential word boundary
            if i > 0 and text[i-1].isalnum():
                continue
                
            # Try to find matches starting at this position
            current_matches = self._find_matches_at_position(text, text_lower, i)
            matches.extend(current_matches)
            
        return matches
    
    def _find_matches_at_position(self, text: str, text_lower: str, start: int) -> List[Tuple[str, Any, int, int]]:
        """
        Find all matches starting at a specific position.
        
        Args:
            text: Original text
            text_lower: Lowercase version of text for matching
            start: Starting position
            
        Returns:
            List of matches from this position
        """
        node = self.root
        matches = []
        
        i = start
        while i < len(text_lower):
            char = text_lower[i]
            
            # If character not in trie, we've reached the end of potential matches
            if char not in node:
                break
                
            # Move to next node
            node = node[char]
            i += 1
            
            # If we've reached a term end
            if self.term_end in node:
                term_data = node[self.term_end]
                end = i
                
                # Check if we're at a word boundary
                if end == len(text) or not text[end].isalnum():
                    # We have a valid match
                    original_term = term_data["term"]
                    matched_text = text[start:end]  # Preserve original capitalization from text
                    matches.append((matched_text, term_data["data"], start, end))
        
        return matches


class HtmlTemplate:
    """Helper class for generating HTML templates for definitions."""
    
    @staticmethod
    def definition(term: str, definition_text: str, additional_content: str = "") -> str:
        """
        Generate HTML for a definition.
        
        Args:
            term: The term being defined
            definition_text: The main definition text
            additional_content: Any additional HTML content to include
            
        Returns:
            Complete HTML for the definition
        """
        return (
            f'<span class="aiv-definition">'
            f'{term}'
            f'<span class="aiv-definition-text">'
            f'{definition_text}'
            f'{additional_content}'
            f'</span>'
            f'</span>'
        )
    
    @staticmethod
    def metadata_field(field_value: Any, header_text: str) -> str:
        """
        Format a metadata field with a header.
        
        Args:
            field_value: The field value (string or list)
            header_text: The header text for the field
            
        Returns:
            Formatted HTML or empty string if no value
        """
        if not field_value:
            return ""
            
        # Convert list of items to a string
        if isinstance(field_value, list):
            # Join the list items with a comma and space
            field_text = ", ".join(field_value)
        else:
            # If it's already a string, use it as is
            field_text = field_value
            
        # Format with a header and paragraph
        if field_text:
            return f"<h4>{header_text}</h4><p>{field_text}</p>"
        return ""
    
    @staticmethod
    def alternative_term_note(preferred_term: str) -> str:
        """Generate note for alternative term."""
        return f"<p><em>Dit is een alternatieve term voor '{preferred_term}'.</em></p>"
    
    @staticmethod
    def alternative_spelling_note(original_term: str) -> str:
        """Generate note for alternative spelling."""
        return f"<p><em>Dit is een alternatieve spelling voor de term '{original_term}'.</em></p>"
    
    @staticmethod
    def extract_definition_text(html: str) -> str:
        """Extract the definition text from a definition HTML."""
        definition_start = html.find('<span class="aiv-definition-text">') + len('<span class="aiv-definition-text">')
        definition_end = html.rfind('</span>')
        if definition_start > 0 and definition_end > definition_start:
            return html[definition_start:definition_end]
        return ""


class DefinitionEnricher:
    def __init__(self, base_dir: Path) -> None:
        """Initialize the definition enricher."""
        self.base_dir = base_dir
        self.logger = self._setup_logger()
        self.term_dict = CaseInsensitiveDict()
        self.term_lower_to_original = {}  # Maps lowercase terms to original capitalization
        self.alternative_spellings = {}
        self.term_preferences = {}
        self.used_terms_cache = {}  # Cache for used terms to avoid rebuilding sets
        self.term_trie = None  # Will be initialized when terms are loaded
        self.debug_enabled = False  # Toggle for debug logging

    def _setup_logger(self) -> logging.Logger:
        """Set up logging configuration."""
        logger = logging.getLogger("DefinitionEnricher")
        logger.setLevel(logging.INFO)
        
        # Only add handler if not already added (prevent duplicate logs)
        if not logger.handlers:
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
        
        # Clear all dictionaries
        self.term_dict.clear()
        self.term_lower_to_original.clear()
        self.alternative_spellings.clear()
        self.term_preferences.clear()
        self.used_terms_cache.clear()
        
        # Process all regular definitions
        self._process_regular_definitions(definitions.get("definitions", []))
        
        # Process alternative terms if available
        if "alternative_terms" in definitions:
            self._process_alternative_terms(definitions["alternative_terms"], definitions["definitions"])
        
        # Initialize the term trie with all terms
        self._initialize_term_trie()
        
        self.logger.info(f"Loaded {len(self.term_dict)} definitions with "
                         f"{len(self.alternative_spellings)} alternative spellings, and {len(self.term_preferences)} alternative terms")

    def _process_regular_definitions(self, definitions: List[Dict]) -> None:
        """Process regular term definitions."""
        for definition in definitions:
            term = definition["term"]
            definition_text = definition["definition"]
            
            # Store original capitalization
            self.term_lower_to_original[term.lower()] = term
            
            # Process metadata fields
            toelichting = ""
            voorbeelden = ""
            if "metadata" in definition:
                metadata = definition["metadata"]
                
                # Format toelichting
                if "toelichting" in metadata:
                    toelichting = HtmlTemplate.metadata_field(
                        metadata["toelichting"], 
                        "Toelichting:"
                    )
                
                # Format voorbeelden
                if "voorbeelden" in metadata:
                    voorbeelden = HtmlTemplate.metadata_field(
                        metadata["voorbeelden"], 
                        "Voorbeeld(en):"
                    )
                
                # Process alternative spellings
                self._process_alternative_spellings(term, definition_text, toelichting, 
                                                    voorbeelden, metadata)

            # Format definition as paragraph
            formatted_definition = f"<p>{definition_text}</p>"
            
            # Create the HTML with definition and metadata
            html_definition = HtmlTemplate.definition(term, formatted_definition, toelichting + voorbeelden)
            self.term_dict[term] = html_definition

    def _process_alternative_spellings(self, term: str, definition_text: str, 
                                       toelichting: str, voorbeelden: str, 
                                       metadata: Dict) -> None:
        """Process alternative spellings for a term."""
        if "alternatieve_spellingen" in metadata:
            alt_spellings = metadata["alternatieve_spellingen"]
            print(alt_spellings)
            if alt_spellings and isinstance(alt_spellings, list):
                for alt_spelling in alt_spellings:
                    # Add note about this being an alternative spelling
                    alt_spelling_note = HtmlTemplate.alternative_spelling_note(term)
                    
                    
                    # Format definition as paragraph
                    formatted_definition = f"<p>{definition_text}</p>"
                    
                    # Add the alternative spelling to the term dictionary
                    alt_html_definition = HtmlTemplate.definition(
                        alt_spelling, 
                        formatted_definition, 
                        alt_spelling_note + toelichting + voorbeelden
                    )
                    
                    self.term_dict[alt_spelling] = alt_html_definition
                    self.term_lower_to_original[alt_spelling.lower()] = alt_spelling
                    
                    # Also track in mapping for reference
                    self.alternative_spellings[alt_spelling.lower()] = term.lower()

    def _process_alternative_terms(self, alternative_terms: List[Dict], definitions: List[Dict]) -> None:
        """Process alternative terms."""
        # Build a fast lookup dictionary for preferred terms by ID
        id_to_term = self._create_id_to_term_mapping(definitions)
        
        self.logger.info(f"Processing {len(alternative_terms)} alternative terms")
        
        for alt_term_def in alternative_terms:
            alt_term = alt_term_def["term"]
            preferred_id = alt_term_def.get("voorkeur_id")
            
            if not preferred_id:
                self.logger.warning(f"Alternative term '{alt_term}' has no voorkeur_id, skipping")
                continue
                
            # Find the preferred term based on its ID
            if preferred_id not in id_to_term:
                self.logger.warning(f"Could not find preferred term with id '{preferred_id}' for alternative term '{alt_term}'")
                continue
            
            preferred_info = id_to_term[preferred_id]
            preferred_term = preferred_info["term"]
            preferred_html = preferred_info["html"]
            preferred_definition = preferred_info["definition"]
            
            if not preferred_html:
                self.logger.warning(f"No HTML definition found for preferred term '{preferred_term}'")
                continue
            
            # Format the definition as a paragraph
            formatted_definition = f"<p>{preferred_definition}</p>"
                
            # Add note about this being an alternative term
            alt_term_note = HtmlTemplate.alternative_term_note(preferred_term)
            
            # Create HTML definition for the alternative term
            alt_html_definition = HtmlTemplate.definition(alt_term, formatted_definition, alt_term_note)
            
            # Add to term dictionary and mapping
            self.term_dict[alt_term] = alt_html_definition
            self.term_lower_to_original[alt_term.lower()] = alt_term
            self.term_preferences[alt_term.lower()] = preferred_term.lower()
            
            # Also add to alternative_spellings mapping for consistency in replace_terms
            self.alternative_spellings[alt_term.lower()] = preferred_term.lower()

    def _create_id_to_term_mapping(self, definitions: List[Dict]) -> Dict[str, Dict]:
        """Create a mapping from term ID to term information."""
        return {
            definition.get("id"): {
                "term": definition["term"],
                "html": self.term_dict.get(definition["term"]),
                "definition": definition["definition"]
            }
            for definition in definitions
            if definition.get("id")
        }

    def _initialize_term_trie(self) -> None:
        """Initialize the term trie with all terms and their variants."""
        self.term_trie = TermTrie()
        
        # Get all terms and their mappings
        term_keys = list(self.term_dict.keys())
        variant_mapping = self.get_term_mappings()
        
        # Add all main terms to trie
        for term in term_keys:
            term_lower = term.lower()
            self.term_trie.add_term(term, {
                "type": "main",
                "term": term,
                "base_term_lower": term_lower
            })
        
        # Add all alternative spellings to trie
        for variant, base_term_lower in variant_mapping.items():
            original_term = self.term_lower_to_original.get(base_term_lower)
            if original_term:
                self.term_trie.add_term(variant, {
                    "type": "variant",
                    "term": variant,
                    "base_term_lower": base_term_lower,
                    "original_term": original_term
                })

    # --- Term Mapping Methods ---

    def get_term_mappings(self) -> Dict[str, str]:
        """Create mapping of alternative terms and spellings to base terms."""
        # Just return the alternative spellings and preferences mappings
        mapping = {}
        mapping.update(self.alternative_spellings)
        mapping.update(self.term_preferences)
        return mapping

    def get_cache_key(self, text: str) -> str:
        """Generate a cache key for used terms based on the text."""
        return hash(text)

    # --- Term Replacement Methods ---

    def replace_terms(self, text: str) -> str:
        """
        Replace the first occurrence of each term with its definition, 
        prioritizing longest matches using the trie.
        """
        if not text:
            return text
        
        # Get or initialize used terms set from cache
        cache_key = self.get_cache_key(text)
        if cache_key in self.used_terms_cache:
            used_terms = self.used_terms_cache[cache_key].copy()
        else:
            used_terms = set()
        
        # Find all potential matches using the trie
        all_matches = self.term_trie.find_matches(text)
        
        # Process matches to get longest match at each position
        processed_matches = self._process_matches(all_matches)
        
        # Replace terms based on processed matches
        result = self._replace_with_definitions(text, processed_matches, used_terms)
        
        # Update the used terms cache
        self.used_terms_cache[cache_key] = used_terms
        
        return result

    def _process_matches(self, matches: List[Tuple[str, Dict, int, int]]) -> List[Tuple[str, Dict, int, int]]:
        """
        Process the raw matches to get the longest match at each position.
        
        Args:
            matches: List of (matched_text, term_data, start, end) tuples
            
        Returns:
            List of processed matches with longest at each position
        """
        # Group matches by start position
        position_matches = {}
        for match in matches:
            matched_text, term_data, start, end = match
            if start not in position_matches:
                position_matches[start] = []
            position_matches[start].append(match)
        
        # Sort positions
        sorted_positions = sorted(position_matches.keys())
        
        # Track processed positions to skip positions covered by longer matches
        processed_positions = set()
        final_matches = []
        
        # Process each position in order
        for pos in sorted_positions:
            # Skip if this position has already been processed as part of a longer match
            if pos in processed_positions:
                continue
                
            # Get matches at this position and sort by length (longest first)
            pos_matches = position_matches[pos]
            pos_matches.sort(key=lambda m: (m[3] - m[2]), reverse=True)
            
            # Get the longest match
            longest_match = pos_matches[0]
            _, _, start, end = longest_match
            
            # Add to final matches
            final_matches.append(longest_match)
            
            # Mark all positions covered by this match as processed
            for p in range(start, end):
                processed_positions.add(p)
                
        # Sort final matches by position
        final_matches.sort(key=lambda m: m[2])
        
        if self.debug_enabled:
            self.logger.info(f"Processed {len(matches)} raw matches into {len(final_matches)} final matches")
            for i, (matched_text, _, start, end) in enumerate(final_matches):
                self.logger.info(f"  Match {i+1}: '{matched_text}' at positions {start}-{end}")
        
        return final_matches

    def _replace_with_definitions(self, text: str, matches: List[Tuple[str, Dict, int, int]], 
                                used_terms: Set[str]) -> str:
        """
        Replace terms with their definitions based on the processed matches.
        Prioritize original terms over alternative terms for first occurrences.
        
        Args:
            text: The original text
            matches: List of processed matches
            used_terms: Set of already used terms (modified in place)
            
        Returns:
            The text with terms replaced by definitions
        """
        # If no matches, return the original text
        if not matches:
            return text
        
        # Classify matches into original and alternative terms
        original_term_matches = []
        alternative_term_matches = []
        
        for match in matches:
            matched_text, term_data, start, end = match
            base_term_lower = term_data["base_term_lower"]
            
            # Check if this is an alternative term/spelling
            is_alternative = base_term_lower in self.term_preferences or base_term_lower in self.alternative_spellings
            
            if is_alternative:
                alternative_term_matches.append(match)
            else:
                original_term_matches.append(match)
        
        # Process matches in priority order: original terms first, then alternative terms
        all_prioritized_matches = original_term_matches + alternative_term_matches
        
        # Sort matches by position to maintain text order
        all_prioritized_matches.sort(key=lambda m: m[2])
        
        result = []
        current_pos = 0
        
        # Track terms that should always redirect to their preferred form
        always_redirect_terms = set()
        # Identify terms that should always be redirected (partial terms)
        for match in alternative_term_matches:
            matched_text, term_data, _, _ = match
            base_term_lower = term_data["base_term_lower"]
            
            # If matched text is significantly shorter than its base term
            # or specifically listed as a partial term, always redirect it
            if base_term_lower in self.term_preferences:
                preferred_term_lower = self.term_preferences[base_term_lower]
                if len(matched_text) <= 3 or len(matched_text) < len(preferred_term_lower) * 0.5:
                    always_redirect_terms.add(base_term_lower)
        
        # Process each match
        for matched_text, term_data, start, end in all_prioritized_matches:
            # Add text before the match
            result.append(text[current_pos:start])
            
            # Get base term information
            base_term_lower = term_data["base_term_lower"]
            
            # Determine if we need to redirect this term
            should_redirect = base_term_lower in always_redirect_terms
            
            # Check if this is an alternative term that needs redirection
            is_alternative = base_term_lower in self.term_preferences or base_term_lower in self.alternative_spellings
            
            # Replace first occurrence only or always redirect short alternative terms
            if base_term_lower not in used_terms or should_redirect:
                original_term = term_data.get("original_term")
                if not original_term:
                    original_term = self.term_lower_to_original.get(base_term_lower)
                    
                # For alternatives that need redirection, get the preferred term
                if is_alternative:
                    if base_term_lower in self.term_preferences:
                        preferred_term_lower = self.term_preferences[base_term_lower]
                    elif base_term_lower in self.alternative_spellings:
                        preferred_term_lower = self.alternative_spellings[base_term_lower]
                    else:
                        preferred_term_lower = base_term_lower
                    
                    preferred_term = self.term_lower_to_original.get(preferred_term_lower)
                    
                    # If this is a term that should always redirect, use the preferred term's definition
                    if should_redirect and preferred_term and preferred_term in self.term_dict:
                        original_term = preferred_term
                    
                if original_term and original_term in self.term_dict:
                    # Get the HTML definition
                    html = self.term_dict[original_term]
                    
                    # Get definition content between tags
                    definition_start = html.find('<span class="aiv-definition-text">') + len('<span class="aiv-definition-text">')
                    definition_end = html.rfind('</span>')
                    if definition_start > 0 and definition_end > definition_start:
                        definition_text = html[definition_start:definition_end]
                    else:
                        definition_text = ""
                    
                    # For short alternative terms that should redirect, adapt the display text
                    display_text = matched_text
                    if should_redirect and is_alternative:
                        # Add an indicator that this is redirecting to a full term
                        result.append(
                            f'<span class="aiv-redirect-term" title="Verwijzing naar {original_term}">'
                            f'{display_text}'
                            '</span>'
                        )
                    else:
                        # Get the original HTML and extract the definition content
                        html = self.term_dict[original_term]
                        definition_text = HtmlTemplate.extract_definition_text(html)

                        # Create new HTML with the original matched text's capitalization
                        # but keeping all the definition text (including notes)
                        definition_html = (
                            '<span class="aiv-definition">'
                            f'{display_text}'  # Use the original matched text
                            '<span class="aiv-definition-text">'
                            f'{definition_text}'
                            '</span>'
                            '</span>'
                        )

                        result.append(definition_html)
                    
                    # Mark the term as used unless it's a term that should always redirect
                    if not should_redirect:
                        used_terms.add(base_term_lower)
                    
                    if self.debug_enabled:
                        action = "Replaced" if not should_redirect else "Redirected"
                        self.logger.info(f"  {action} '{matched_text}' with definition of '{original_term}'")
                else:
                    # Term not found in dictionary
                    result.append(matched_text)
            else:
                # Already used this term
                result.append(matched_text)
                
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
        - Process options values only for checkbox_option type tasks
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
                    
            # Process options values ONLY for checkbox_option type tasks
            task_type = task.get("type", [])
            # Handle both string and list types
            if isinstance(task_type, str):
                is_checkbox_option = task_type == "checkbox_option"
            elif isinstance(task_type, list):
                is_checkbox_option = "checkbox_option" in task_type
            else:
                is_checkbox_option = False
                
            if is_checkbox_option and "options" in task and isinstance(task["options"], list):
                for option in task["options"]:
                    if "value" in option and isinstance(option["value"], str):
                        option["value"] = self.replace_terms(option["value"])

            # Process dependencies with 'contains' operator
            if "dependencies" in task and isinstance(task["dependencies"], list):
                for dependency in task["dependencies"]:
                    if (
                        isinstance(dependency, dict)
                        and dependency.get("type") == "conditional"
                        and dependency.get("condition", {}).get("operator") == "contains"
                    ):
                        # Include the value in the processing if it exists
                        condition = dependency.get("condition", {})
                        value = condition.get("value")
                        if isinstance(value, str):
                            # Process the value using replace_terms
                            replaced_value = self.replace_terms(value)
                            condition["value"] = replaced_value.strip("'")

            # Recursively process subtasks with incremented level
            if "tasks" in task and isinstance(task["tasks"], list):
                self.process_tasks(task["tasks"], level + 1)

    def enrich_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Enrich data with term definitions, respecting the level structure."""
        enriched_data = data.copy()
        
        if "tasks" in enriched_data and isinstance(enriched_data["tasks"], list):
            self.process_tasks(enriched_data["tasks"], level=0)
            
        return enriched_data


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
    parser.add_argument("--debug", action="store_true",
                        help="Enable debug logging")
    
    args = parser.parse_args()
    
    # Run the enricher
    enricher = DefinitionEnricher(script_dir)
    enricher.debug_enabled = args.debug
    
    try:
        enricher.enrich_and_export(args.source, args.definitions, args.output)
    except Exception:
        sys.exit(1)
        
    sys.exit(0)


if __name__ == "__main__":
    main()
