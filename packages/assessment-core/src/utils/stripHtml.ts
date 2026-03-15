// These functions process trusted schema content (task definitions from DPIA.json/PreScanDPIA.json),
// not user-supplied input. The innerHTML usage is safe in this context.

export function cleanDefinitions(html: string | undefined | null): string {
  if (!html) return '';

  const tempElement = document.createElement('div');
  // Safe: html comes from trusted schema definitions, not user input
  tempElement.innerHTML = html; // nosec: trusted schema content

  const definitionTexts = tempElement.querySelectorAll('span.aiv-definition-text');
  definitionTexts.forEach(element => element.remove());

  const definitions = tempElement.querySelectorAll('span.aiv-definition');
  definitions.forEach(element => {
    const textNode = document.createTextNode(element.textContent || '');
    element.parentNode?.replaceChild(textNode, element);
  });

  return tempElement.innerHTML;
}

export function getPlainTextWithoutDefinitions(html: string | undefined | null): string {
  if (!html) return '';

  const cleanedHtml = cleanDefinitions(html);

  const tempElement = document.createElement('div');
  // Safe: cleanedHtml comes from trusted schema definitions
  tempElement.innerHTML = cleanedHtml; // nosec: trusted schema content
  return tempElement.textContent || '';
}
