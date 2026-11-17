/** "1 open reservation" / "3 open reservations": counts belong in conflict messages, never in extra error fields. */
export function countPhrase(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Joins the count phrases whose count is above zero: "2 reservations and 1 clinical visit", "1 reservation",
 * "1 a, 2 bs and 3 cs". Empty string when every count is zero.
 */
export function countList(parts: Array<[count: number, singular: string, plural?: string]>): string {
  const phrases = parts.filter(([count]) => count > 0).map(([count, singular, plural]) => countPhrase(count, singular, plural));
  return phrases.length > 1 ? `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}` : phrases[0] ?? "";
}
