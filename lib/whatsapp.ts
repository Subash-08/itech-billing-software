export function normalizeIndianWhatsAppNumber(value: string): string | null {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) return digits;
  return null;
}

export function whatsappUrl(phone: string, message: string): string | null {
  const normalized = normalizeIndianWhatsAppNumber(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message.trim())}`;
}

export function invoiceWhatsAppMessage(input: {
  customerName: string;
  shopName: string;
  invoiceNumber: string;
  total: string;
  due: string;
  shareUrl?: string;
}): string {
  const dueText = input.due ? ` Outstanding amount: ${input.due}.` : '';
  const linkText = input.shareUrl ? ` Invoice link: ${input.shareUrl}` : '';
  return `Hello ${input.customerName || 'Customer'}, thank you for choosing ${input.shopName}. Invoice ${input.invoiceNumber} total: ${input.total}.${dueText}${linkText} Please review the invoice and contact us if you need any help.`;
}
