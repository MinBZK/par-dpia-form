export function cleanDefinitions(html: string | undefined | null): string {
  if (!html) return '';

  // Create a temporary DOM element
  const tempElement = document.createElement('div');
  tempElement.innerHTML = html;

  // Remove all definition-text spans (including their content)
  const definitionTexts = tempElement.querySelectorAll('span.aiv-definition-text');
  definitionTexts.forEach(element => element.remove());

  // Replace all definition spans with their content
  const definitions = tempElement.querySelectorAll('span.aiv-definition');
  definitions.forEach(element => {
    // Replace the span with its text content
    const textNode = document.createTextNode(element.textContent || '');
    element.parentNode?.replaceChild(textNode, element);
  });

  // Return the cleaned HTML
  return tempElement.innerHTML;
}

export function getPlainTextWithoutDefinitions(html: string | undefined | null): string {
  if (!html) return '';

  // First remove the definition text spans and unwrap definition spans
  const cleanedHtml = cleanDefinitions(html);

  // Then extract just the text content
  const tempElement = document.createElement('div');
  tempElement.innerHTML = cleanedHtml;
  return tempElement.textContent || '';
}
