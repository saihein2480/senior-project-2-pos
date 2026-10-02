/**
 * Pure id and barcode generators for stock documents.
 *
 * Shared by the client-SDK StockService and the server-side Admin module
 * (src/server/stocksAdmin.ts) so both produce ids and barcodes the same way.
 */

/** Unique-enough id for wholesale tiers and colour variants. */
export const generateId = () =>
  Date.now().toString() + Math.random().toString(36).substr(2, 9);

/** Generate an EAN-13 barcode string. */
export const generateEAN13 = (): string => {
  const countryCode = "885"; // Thailand
  const manufacturerCode = "1001";
  const timestamp = Date.now().toString();
  const productCode = timestamp.slice(-5);
  const first12Digits = countryCode + manufacturerCode + productCode;

  const calculateCheckDigit = (digits: string): string => {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(digits[i], 10);
      sum += i % 2 === 0 ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit.toString();
  };

  const checkDigit = calculateCheckDigit(first12Digits);
  return first12Digits + checkDigit;
};
