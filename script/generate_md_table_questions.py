import yaml
import os
import argparse
import sys


def extract_task_info(task, parent_path=""):
    """
    Recursively extract information from tasks and their subtasks.

    Args:
        task: The task dictionary
        parent_path: The path to this task for display purposes

    Returns:
        List of dictionaries containing task information
    """
    result = []

    # Skip tasks that don't have an ID
    if "id" not in task:
        return result

    task_id = task["id"]
    task_text = task.get("task", "")
    task_type = (
        ", ".join(task.get("type", []))
        if isinstance(task.get("type", []), list)
        else task.get("type", "")
    )

    # Calculate display path for the visual hierarchy (not affecting the ID)
    current_path = parent_path + " > " + task_text if parent_path else task_text
    display_depth = current_path.count(">")

    # Extract options if available
    options = []
    if "options" in task and task["options"]:
        for option in task["options"]:
            if "label" in option and "value" in option:
                options.append(f"{option['value']}")
            elif "value" in option:
                options.append(option["value"])

    options_str = "; ".join(options) if options else ""

    # Extract relationships (dependencies and references) - SIMPLIFIED
    related = []

    # Extract dependencies
    if "dependencies" in task:
        for dep in task["dependencies"]:
            if dep.get("type") == "conditional" and "condition" in dep:
                condition = dep["condition"]
                related.append(f"Show if {condition.get('id', '')}")
            elif dep.get("type") == "source_options" and "condition" in dep:
                condition = dep["condition"]
                related.append(f"Options from {condition.get('id', '')}")
            elif dep.get("type") == "instance_mapping" and "source" in dep:
                source = dep["source"]
                related.append(f"Copy from {source.get('id', '')}")

    # Extract references (simplified)
    if "references" in task:
        for ref_key, ref_value in task["references"].items():
            related.append(f"{ref_key}: {ref_value}")

    related_str = "; ".join(related) if related else ""

    # Add current task to results
    result.append(
        {
            "id": task_id,
            "text": task_text,
            "type": task_type,
            "options": options_str,
            "related": related_str,
            "depth": display_depth,
        }
    )

    # Process subtasks recursively
    if "tasks" in task and task["tasks"]:
        for subtask in task["tasks"]:
            result.extend(extract_task_info(subtask, current_path))

    return result


def process_yaml_file(file_path):
    """
    Process a YAML file and extract task information.

    Args:
        file_path: Path to the YAML file

    Returns:
        List of dictionaries containing task information
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)

        all_tasks = []

        if "tasks" in data:
            for task in data["tasks"]:
                all_tasks.extend(extract_task_info(task))

        return all_tasks, data.get("name", os.path.basename(file_path))
    except yaml.YAMLError as e:
        print(f"Error parsing YAML file: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error processing file: {e}")
        sys.exit(1)


def generate_markdown_table(tasks, file_name):
    """
    Generate a markdown table from task information.

    Args:
        tasks: List of dictionaries containing task information
        file_name: Name of the file being processed

    Returns:
        Markdown string
    """
    # Initialize markdown string with heading
    md = f"# Question Overview for {file_name}\n\n"

    # Add table headers
    md += "| Question ID | Question | Type | Options | Related Questions |\n"
    md += "|------------|----------|------|---------|-------------------|\n"

    # Add rows for each task
    for task in tasks:
        # Indent question text based on depth to show hierarchy
        indent = "  " * task["depth"]
        question_text = f"{indent}{task['text']}"

        md += f"| {task['id']} | {question_text} | {task['type']} | {task['options']} | {task['related']} |\n"

    return md


def parse_arguments():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Generate a markdown table from YAML form definition files.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Example usage:
  python generate_md_table_questions.py --source sources/DPIA.yaml --output docs/DPIA_questions.md

  # Similar to the validate and inject script format:
  python generate_md_table_questions.py \\
    --source sources/DPIA.yaml \\
    --output docs/DPIA_questions.md
        """,
    )
    parser.add_argument("--source", required=True, help="Path to the source YAML file")
    parser.add_argument(
        "--output",
        help="Path to the output markdown file (default: derived from source filename)",
    )
    return parser.parse_args()


def main():
    args = parse_arguments()

    yaml_file = args.source

    # If output file is not specified, derive it from the source filename
    if args.output:
        output_file = args.output
    else:
        base_name = os.path.splitext(os.path.basename(yaml_file))[0]
        output_file = f"{base_name}_questions.md"

    # Ensure output file has .md extension
    if not output_file.endswith(".md"):
        output_file += ".md"

    # Create output directory if it doesn't exist
    output_dir = os.path.dirname(output_file)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)

    if not os.path.exists(yaml_file):
        print(f"Error: Source file not found: {yaml_file}")
        sys.exit(1)

    tasks, file_name = process_yaml_file(yaml_file)
    md_content = generate_markdown_table(tasks, file_name)

    # Write the result to a Markdown file
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(md_content)

        print(f"Successfully processed {yaml_file}")
        print(f"Markdown file generated: {output_file}")
    except Exception as e:
        print(f"Error writing output file: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
