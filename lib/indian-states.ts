export const INDIAN_STATE_CODES: Record<string, string> = {
  '01':'Jammu and Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh','05':'Uttarakhand',
  '06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh','10':'Bihar','11':'Sikkim',
  '12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur','15':'Mizoram','16':'Tripura','17':'Meghalaya',
  '18':'Assam','19':'West Bengal','20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh',
  '24':'Gujarat','26':'Dadra and Nagar Haveli and Daman and Diu','27':'Maharashtra','29':'Karnataka',
  '30':'Goa','31':'Lakshadweep','32':'Kerala','33':'Tamil Nadu','34':'Puducherry',
  '35':'Andaman and Nicobar Islands','36':'Telangana','37':'Andhra Pradesh','38':'Ladakh',
};

const normalizedNames = new Map(
  Object.entries(INDIAN_STATE_CODES).map(([code, name]) => [name.toLowerCase().replace(/[^a-z0-9]/g, ''), code]),
);

// Common accepted spellings. Values remain GST state codes, which are the
// stable comparison key even when users type punctuation or spacing differently.
normalizedNames.set('orissa', '21');
normalizedNames.set('pondicherry', '34');
normalizedNames.set('nctofdelhi', '07');
normalizedNames.set('newdelhi', '07');

export function gstStateCode(value?: string, explicitCode?: string): string {
  const code = (explicitCode || '').trim();
  if (/^\d{2}$/.test(code) && INDIAN_STATE_CODES[code]) return code;
  const raw = (value || '').trim();
  if (/^\d{2}$/.test(raw) && INDIAN_STATE_CODES[raw]) return raw;
  return normalizedNames.get(raw.toLowerCase().replace(/[^a-z0-9]/g, '')) || '';
}

export function sameGstState(
  leftState?: string,
  rightState?: string,
  leftCode?: string,
  rightCode?: string,
): boolean | undefined {
  const left = gstStateCode(leftState, leftCode);
  const right = gstStateCode(rightState, rightCode);
  if (left && right) return left === right;
  const normalize = (value?: string) => (value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = normalize(leftState);
  const b = normalize(rightState);
  return a && b ? a === b : undefined;
}
