export const EVENT_SEED_SCHEMA = 'dgfy-external-event-seed/v1';

const contactPattern = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\d\s().-]{7,}\d)/i;
const containsContact = (value) => String(value).includes('@') || contactPattern.test(String(value));
const cleanText = (value, limit) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
const safeText = (value, limit) => {
  const text = cleanText(value, limit);
  return containsContact(text) ? '' : text;
};
const coordinates = (latitude, longitude) => {
  if (latitude == null || longitude == null || latitude === '' || longitude === '') return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)
    || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { latitude: lat, longitude: lng };
};
const skip = (provider, reference, reason) => ({ provider, reference, reason });
const first = (...values) => values.find((value) => String(value ?? '').trim()) || '';
const numericId = (value) => {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number <= 0) return null;
  return { value: String(number), number };
};
const mapviuRows = (data) => {
  if (Array.isArray(data)) return data.find((entry) => entry?.type === 'table' && entry.name === 'properties')?.data || [];
  return Array.isArray(data?.properties) ? data.properties : [];
};
const proventusRows = (data) => {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.companies) ? data.companies : null;
};

export const extractExternalEventSeed = (input = {}) => {
  const { synqcoreExport = null, synqcoreRoomsExport = null, mapviuExports = [], proventusExports = [] } = input;
  const hasSynqcore = Object.prototype.hasOwnProperty.call(input, 'synqcoreExport');
  const hasSynqcoreRooms = Object.prototype.hasOwnProperty.call(input, 'synqcoreRoomsExport');
  const hasMapviu = Object.prototype.hasOwnProperty.call(input, 'mapviuExports');
  const hasProventus = Object.prototype.hasOwnProperty.call(input, 'proventusExports');

  if (hasSynqcore && !Array.isArray(synqcoreExport?.properties)) throw new Error('SynqCore properties array is required');
  if (hasSynqcore && !hasSynqcoreRooms) throw new Error('SynqCore room coordinates export is required');
  if (hasSynqcoreRooms && !Array.isArray(synqcoreRoomsExport?.rooms)) throw new Error('SynqCore rooms array is required');
  if (hasSynqcoreRooms && !hasSynqcore) throw new Error('SynqCore properties export is required');
  if (hasMapviu && (!Array.isArray(mapviuExports) || mapviuExports.length === 0)) {
    throw new Error('At least one MapViu export is required');
  }
  const companies = hasProventus ? proventusRows(proventusExports) : null;
  if (hasProventus && !companies) throw new Error('Proventus companies array is required');
  if (!hasSynqcore && !hasMapviu && !hasProventus) throw new Error('At least one external event source is required');

  const listings = [];
  const skipped = [];

  const synqcoreRoomsByProperty = new Map();
  for (const room of (hasSynqcoreRooms ? synqcoreRoomsExport.rooms : [])) {
    const propertyId = numericId(room?.property_id);
    const roomId = numericId(room?.room_id);
    if (!propertyId || !roomId) continue;
    const current = synqcoreRoomsByProperty.get(propertyId.value);
    if (!current || roomId.number < current.roomNumber) {
      synqcoreRoomsByProperty.set(propertyId.value, {
        roomId: roomId.value,
        roomNumber: roomId.number,
        point: coordinates(room?.room_lat, room?.room_lng)
      });
    }
  }

  for (const row of (hasSynqcore ? synqcoreExport.properties : [])) {
    const propertyId = numericId(row?.id);
    const slugId = propertyId?.value || String(row?.id ?? '').trim();
    const room = propertyId ? synqcoreRoomsByProperty.get(propertyId.value) : null;
    const reference = room?.roomId || '';
    const title = cleanText(row?.name, 255);
    const point = coordinates(row?.lat, row?.lng) || room?.point;
    const reason = /\btest\b/i.test(title) ? 'test_record'
      : !propertyId || !title ? 'invalid_reference'
        : !room ? 'missing_room_id'
        : containsContact(title) ? 'pii_in_title'
          : !point ? 'no_coordinates' : '';
    if (reason) {
      skipped.push(skip('synqcore', reference || propertyId?.value || String(row?.id ?? '').trim(), reason));
      continue;
    }
    listings.push({
      slug: `synqcore-${slugId}`, external_provider: 'synqcore', external_reference_id: reference,
      title, ...point, address_line: safeText(first(row.formatted_address, row.address), 255), description: ''
    });
  }

  const seen = new Set();
  for (const data of (hasMapviu ? mapviuExports : [])) {
    for (const row of mapviuRows(data)) {
      const reference = String(row?.id ?? '').trim().toLowerCase();
      if (seen.has(reference)) continue;
      seen.add(reference);
      const title = cleanText(row?.title, 255);
      const point = coordinates(row?.latitude, row?.longitude);
      const reason = !/^[0-9a-f-]{36}$/.test(reference) || !title ? 'invalid_reference'
        : /\btest\b/i.test(title) ? 'test_record'
          : containsContact(title) ? 'pii_in_title'
            : String(row?.status || '').toLowerCase() !== 'active' ? 'not_active'
              : String(row?.moderation_status || '').toLowerCase() !== 'approved' ? 'not_approved'
                : String(row?.hide_exact_location) === '1' ? 'hidden_location'
                  : !['mapviu', 'both'].includes(String(row?.distribution_scope || '').toLowerCase()) ? 'client_only_scope'
                    : !point ? 'no_coordinates' : '';
      if (reason) {
        skipped.push(skip('mapviu', reference, reason));
        continue;
      }
      listings.push({
        slug: `mapviu-${reference}`, external_provider: 'mapviu', external_reference_id: reference,
        title, ...point,
        address_line: safeText(first(row.geocoded_address, row.entered_address,
          [row.city, row.province].filter(Boolean).join(', ')), 255),
        description: safeText(row.description, 120)
      });
    }
  }

  const seenProventus = new Set();
  for (const company of companies || []) {
    const reference = String(company?.id ?? '').trim().toLowerCase();
    if (seenProventus.has(reference)) continue;
    seenProventus.add(reference);
    const title = cleanText(company?.name, 255);
    const point = coordinates(company?.latitude, company?.longitude);
    const reason = !/^[0-9a-f-]{36}$/.test(reference) || !title ? 'invalid_reference'
      : /\btest\b/i.test(String(company?.name ?? '')) ? 'test_record'
        : containsContact(title) ? 'pii_in_title'
          : String(company?.status || '').toLowerCase() !== 'active' || company?.isActive !== 1 ? 'not_active'
            : !point ? 'no_coordinates' : '';
    if (reason) {
      skipped.push(skip('proventus', reference, reason));
      continue;
    }
    listings.push({
      slug: `proventus-${reference}`, external_provider: 'proventus', external_reference_id: reference,
      title, ...point, address_line: safeText(company?.location, 255),
      description: safeText(company?.description, 120)
    });
  }

  return { listings, skipped };
};

const listingKeys = ['slug', 'external_provider', 'external_reference_id', 'title', 'latitude', 'longitude', 'address_line', 'description'];
export const validateExternalEventSeed = (seed) => {
  if (seed?.schema !== EVENT_SEED_SCHEMA || !Array.isArray(seed.listings) || !Array.isArray(seed.skipped)) {
    throw new Error('Invalid external event seed schema');
  }
  const topKeys = ['schema', 'generated_at', 'sources', 'listings', 'skipped'];
  if (Object.keys(seed).sort().join() !== topKeys.sort().join()
    || !Array.isArray(seed.sources)
    || seed.sources.some((source) => Object.keys(source).sort().join() !== ['provider', 'file', 'exported_at'].sort().join()
      || String(source.file).includes('/') || String(source.file).includes('\\'))
    || seed.skipped.some((row) => Object.keys(row).sort().join() !== ['provider', 'reference', 'reason'].sort().join())) {
    throw new Error('Unexpected external event seed fields');
  }
  const seen = new Set();
  const seenProviderReferences = new Set();
  for (const listing of seed.listings) {
    if (Object.keys(listing).sort().join() !== [...listingKeys].sort().join()) throw new Error('Unexpected listing fields');
    const provider = listing.external_provider;
    const reference = String(listing.external_reference_id).toLowerCase();
    const identityIsValid = provider === 'synqcore'
      ? /^synqcore-\d+$/.test(listing.slug) && /^\d+$/.test(reference)
      : ['mapviu', 'proventus'].includes(provider)
        && listing.slug === `${provider}-${reference}`;
    const providerReference = `${provider}:${reference}`;
    if (!['synqcore', 'mapviu', 'proventus'].includes(provider)
      || !identityIsValid
      || !coordinates(listing.latitude, listing.longitude)
      || !listing.title || listing.title.length > 255
      || String(listing.address_line).length > 255 || String(listing.description).length > 120
      || [listing.title, listing.address_line, listing.description].some(containsContact)
      || seen.has(listing.slug) || seenProviderReferences.has(providerReference)) {
      throw new Error(`Invalid listing ${listing.slug || ''}`);
    }
    seen.add(listing.slug);
    seenProviderReferences.add(providerReference);
  }
  return seed;
};
