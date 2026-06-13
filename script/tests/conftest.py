"""Pytest configuration: make the ``script/`` modules importable.

The pipeline scripts live in ``script/`` and import each other by bare module
name (e.g. ``from schema_validator import SchemaValidator``). Adding the parent
``script/`` directory to ``sys.path`` lets the tests import those modules and
their functions directly, without shelling out.
"""

import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent.parent

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
