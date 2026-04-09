import React, { useEffect, useMemo } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

function MapCenterController({ center }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center)
  }, [center, map])
  return null
}

function MapClickController({ onPick }) {
  useMapEvents({
    click(event) {
      onPick({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      })
    },
  })
  return null
}

export default function MapLocationPicker({ latitude, longitude, onChange }) {
  const parsedLatitude = typeof latitude === 'string' ? latitude.trim() : latitude
  const parsedLongitude = typeof longitude === 'string' ? longitude.trim() : longitude
  const hasCoordinates =
    parsedLatitude !== '' &&
    parsedLongitude !== '' &&
    Number.isFinite(Number(parsedLatitude)) &&
    Number.isFinite(Number(parsedLongitude))

  const center = useMemo(() => {
    if (hasCoordinates) {
      return [Number(parsedLatitude), Number(parsedLongitude)]
    }
    return [20.5937, 78.9629]
  }, [hasCoordinates, parsedLatitude, parsedLongitude])

  const markerPosition = hasCoordinates ? [Number(parsedLatitude), Number(parsedLongitude)] : center

  return (
    <div className="w-full h-[300px] rounded-xl overflow-hidden border border-gray-200">
      <MapContainer center={center} zoom={hasCoordinates ? 15 : 5} className="w-full h-full">
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapCenterController center={center} />
        <MapClickController onPick={onChange} />
        <Marker
          position={markerPosition}
          draggable
          eventHandlers={{
            dragend: (event) => {
              const coords = event.target.getLatLng()
              onChange({ lat: coords.lat, lng: coords.lng })
            },
          }}
        />
      </MapContainer>
    </div>
  )
}
