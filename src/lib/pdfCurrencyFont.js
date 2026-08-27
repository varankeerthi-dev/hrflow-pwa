import currencyFontUrl from './pdf-assets/hrflow-currency.ttf?url'

const FONT_FILE_NAME = 'HRFlowCurrency.ttf'
const FONT_FAMILY = 'HRFlowCurrency'

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }

  return window.btoa(binary)
}

/**
 * Registers a compact, bundled Unicode font containing ₹ and numeric glyphs.
 * It is deliberately applied only to money strings so standard report text
 * continues to use the existing jsPDF Helvetica setup.
 */
export async function registerPdfCurrencyFont(pdf) {
  if (pdf.getFontList?.()[FONT_FAMILY]) return FONT_FAMILY

  const response = await fetch(currencyFontUrl)
  if (!response.ok) throw new Error('Unable to load the PDF currency font.')

  const buffer = await response.arrayBuffer()
  pdf.addFileToVFS(FONT_FILE_NAME, arrayBufferToBase64(buffer))
  pdf.addFont(FONT_FILE_NAME, FONT_FAMILY, 'normal')
  return FONT_FAMILY
}
