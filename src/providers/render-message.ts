export function renderMessage(
  template: string,
  contact: { name: string | null; phone: string | null; externalId: string | null },
): string {
  return template
    .replaceAll('{{name}}', contact.name ?? '')
    .replaceAll('{{phone}}', contact.phone ?? '')
    .replaceAll('{{externalId}}', contact.externalId ?? '');
}
