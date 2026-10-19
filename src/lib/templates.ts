// Fills {placeholders} in message templates. Unknown placeholders are left out rather than shown raw.
export type TemplateVars = Record<string, string | null | undefined>;

export function render(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{(\w+)\}/g, (_, name: string) => (vars[name] ?? "").toString())
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function firstName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first && /^[\p{L}'.]{1,30}$/u.test(first) ? first : "there";
}
