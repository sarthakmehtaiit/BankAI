// Hide sensitive numbers before text is shown, logged or sent to the AI.

// "501000000001" -> "XXXX0001"
export function maskAccountNumber(accountNumber) {
  return 'XXXX' + String(accountNumber).slice(-4);
}

// "ABCPN1234K" -> "ABCPN****K"
export function maskPan(pan) {
  const text = String(pan ?? '');
  return text.length === 10 ? text.slice(0, 5) + '****' + text.slice(9) : '****';
}

// Masks PAN numbers, Aadhaar numbers and long digit runs (account / phone numbers) inside free text.
export function maskSensitive(text) {
  return String(text ?? '')
    .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi, '[PAN hidden]')
    .replace(/\b\d{4} \d{4} \d{4}\b/g, '[Aadhaar hidden]')
    .replace(/\b\d{9,18}\b/g, (digits) => 'XXXX' + digits.slice(-4));
}
