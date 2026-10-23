// Quote every field. Mark formula-like text, including full-width variants,
// inside the quotes; JSON in the full export preserves the original text.
export function csvCell(value: unknown): string {
  let text =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (
    typeof value === "string" &&
    (/^[\u0000-\u001f\u007f]/.test(text) ||
      /^[=+\-@]/.test(text.trimStart().normalize("NFKC")))
  )
    text = "\t" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export const csvLine = (values: unknown[]) =>
  values.map(csvCell).join(",") + "\r\n";
