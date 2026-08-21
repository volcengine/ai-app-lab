export function normalizeCityScope(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "")
    .replace(/(?:市|地区|自治州|盟)$/u, "");
}

export function isSameCityScope(left: string, right: string): boolean {
  const normalizedLeft = normalizeCityScope(left);
  const normalizedRight = normalizeCityScope(right);
  return Boolean(normalizedLeft) && normalizedLeft === normalizedRight;
}
