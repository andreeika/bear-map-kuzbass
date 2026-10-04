// Определение названия места по координатам через Nominatim (OpenStreetMap).
// Номер дома намеренно не берём: достаточно улицы и населённого пункта.
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&addressdetails=1` +
      `&accept-language=ru&lat=${lat}&lon=${lng}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const a = (await res.json()).address ?? {};

    const street = a.road || a.pedestrian || a.residential || a.path;
    const locality = a.city || a.town || a.village || a.hamlet || a.suburb;
    const district = a.municipality || a.county || a.state_district;

    let label: string | null = null;
    if (street) label = [street, locality].filter(Boolean).join(', ');
    else if (locality) label = `окрестности: ${locality}`;
    else if (district) label = district;

    return label ? label.slice(0, 120) : null;
  } catch {
    return null;
  }
}