export function haversineDistanceMeters(from, to) {
  if (!from || !to) return Number.POSITIVE_INFINITY
  const lat1 = Number(from.lat)
  const lon1 = Number(from.lng)
  const lat2 = Number(to.lat)
  const lon2 = Number(to.lng)
  if ([lat1, lon1, lat2, lon2].some(Number.isNaN)) return Number.POSITIVE_INFINITY

  const earthRadiusMeters = 6371000
  const toRadians = (value) => (value * Math.PI) / 180
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(earthRadiusMeters * c)
}

export function normalizeSiteCoordinates(site) {
  if (!site) return null
  const lat = Number(
    site.latitude ??
      site.lat ??
      site.coordinates?.lat ??
      site.coordinates?.latitude
  )
  const lng = Number(
    site.longitude ??
      site.lng ??
      site.lon ??
      site.coordinates?.lng ??
      site.coordinates?.longitude
  )

  if (Number.isNaN(lat) || Number.isNaN(lng)) return null
  return { lat, lng }
}

export function normalizeSiteName(site) {
  return (
    site?.siteName ||
    site?.name ||
    site?.title ||
    site?.locationName ||
    'Site'
  )
}

