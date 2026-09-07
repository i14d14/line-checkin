// Haversine formula to compute distance in meters
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 自動地址轉經緯度 (Progressive Auto-Geocoding for Taiwan addresses)
export async function autoGeocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  if (!address || typeof address !== "string") return null;

  const raw = address.trim();
  const queries: string[] = [raw];

  const cleanStreet = raw.replace(/\d+[-~至之\d]*號.*$/, "");
  if (cleanStreet && cleanStreet !== raw) {
    queries.push(cleanStreet);
  }

  queries.push(raw.replace(/(市|縣)(.+?區)/, "$1"));
  if (cleanStreet) {
    queries.push(cleanStreet.replace(/(市|縣)(.+?區)/, "$1"));
  }

  for (const q of queries) {
    const qClean = q.trim();
    if (!qClean) continue;

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(qClean)}&format=json&limit=1&countrycodes=tw`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "Antigravity-LINE-Checkin/1.0 (contact@checkin.local)" }
      });
      if (resp.ok) {
        const data = (await resp.json()) as any;
        if (data && data.length > 0) {
          return {
            lat: parseFloat(parseFloat(data[0].lat).toFixed(6)),
            lon: parseFloat(parseFloat(data[0].lon).toFixed(6))
          };
        }
      }
    } catch (e) {
      console.error("Nominatim query failed for:", qClean, e);
    }
  }

  return null;
}
