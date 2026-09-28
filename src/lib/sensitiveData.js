export function maskSensitiveValue(value, visibleCharacters = 4) {
  if (value === undefined || value === null) return ''

  const normalized = String(value).trim()
  if (!normalized) return ''

  const characters = Array.from(normalized)
  const allowedVisibleCount = Math.max(0, visibleCharacters)
  const visibleCount = characters.length <= allowedVisibleCount
    ? 0
    : Math.min(allowedVisibleCount, characters.length - 1)
  const maskedCount = characters.length - visibleCount

  const visibleValue = visibleCount === 0 ? '' : characters.slice(-visibleCount).join('')
  return `${'•'.repeat(maskedCount)}${visibleValue}`
}
