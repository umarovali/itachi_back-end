/** "+998 (90) 123-45-67" -> "+998901234567" */
export function normalizePhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}
