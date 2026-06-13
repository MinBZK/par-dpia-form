/**
 * Returns the most recent date from a list, or null if the list is empty.
 */
export function computeLastModifiedAt(dates: Date[]): Date | null {
  if (dates.length === 0) return null
  return dates.reduce((max, d) => d > max ? d : max, dates[0])
}
