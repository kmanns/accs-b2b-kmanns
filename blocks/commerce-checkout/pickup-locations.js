/* eslint-disable import/no-unresolved */

function haversineDistanceMiles(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 3958.7613;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)));

  return R * c;
}

function normalizePickupLocation(item) {
  const code = item.pickup_location_code || item.code || item.source_code || item.sourceCode;
  const name = item.name || item.store_name || item.storeName || code || 'Pickup location';

  const parseCoordinate = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return Number.NaN;
    const normalized = value.trim().replace(',', '.');
    return Number(normalized);
  };

  const lat = parseCoordinate(
    item.latitude
    ?? item.lat
    ?? item.geo_coordinates?.latitude
    ?? item.geoCoordinates?.latitude,
  );
  const lng = parseCoordinate(
    item.longitude
    ?? item.lng
    ?? item.geo_coordinates?.longitude
    ?? item.geoCoordinates?.longitude,
  );

  const street = Array.isArray(item.street)
    ? item.street.filter(Boolean).join(', ')
    : (item.street ?? '');

  return {
    code,
    name,
    lat,
    lng,
    hasGeo: Number.isFinite(lat) && Number.isFinite(lng),
    phone: item.phone ?? '',
    address1: street,
    city: item.city ?? '',
    region: item.region ?? item.region_code ?? '',
    postalCode: item.postcode ?? item.postal_code ?? '',
    country: item.country_id ?? item.country ?? '',
    raw: item,
  };
}

function formatAddressHtml(store) {
  const line1 = store.address1 ?? '';
  const line2 = [store.city, store.region, store.postalCode].filter(Boolean).join(', ');
  const line3 = store.country ? store.country : '';
  return [line1, line2, line3].filter(Boolean).join('<br/>');
}

function stripXssiPrefix(text) {
  if (!text) return text;
  const trimmed = text.trimStart();
  if (trimmed.startsWith(")]}'")) return trimmed.slice(4).trimStart();
  if (trimmed.startsWith('while(1);')) return trimmed.slice('while(1);'.length).trimStart();
  return text;
}

function isLikelySaasGateway(url) {
  try {
    const u = new URL(url, window.location.origin);
    return u.hostname.endsWith('.api.commerce.adobe.com');
  } catch (e) {
    return false;
  }
}

function isSameOrigin(url) {
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin;
  } catch (e) {
    return false;
  }
}

async function commerceGraphQL({ endpoint, headers = {}, query, variables }) {
  if (!endpoint) {
    throw new Error('Missing graphqlEndpoint (expected config key "commerce-endpoint").');
  }

  let res;
  let rawText = '';
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...headers,
      },
      body: JSON.stringify({ query, variables }),
    });

    rawText = await res.text();
  } catch (e) {
    // Browser throws "Failed to fetch" for CORS / blocked mixed content / DNS failures.
    const saas = isLikelySaasGateway(endpoint);
    const sameOrigin = isSameOrigin(endpoint);

    if (saas && !sameOrigin) {
      throw new Error(
        `Failed to fetch (CORS). Your "commerce-endpoint" points to the Commerce SaaS gateway, which is usually blocked by browsers.\n`
        + `Fix: set config "commerce-endpoint" to a SAME-ORIGIN proxy path like "/graphql" (or "/api/graphql"), and configure your edge/CDN to forward it to the SaaS URL.\n`
        + `Current endpoint: ${endpoint}`,
      );
    }

    throw new Error(`Failed to fetch (network/CORS). Endpoint: ${endpoint}`);
  }

  if (!res.ok) {
    throw new Error(`GraphQL HTTP ${res.status}. Response starts: ${rawText.slice(0, 160)}`);
  }

  const text = stripXssiPrefix(rawText);

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON. Response starts: ${text.trimStart().slice(0, 160)}`);
  }

  if (json.errors?.length) {
    throw new Error(json.errors.map((err) => err.message).join('; '));
  }

  return json.data;
}

const PICKUP_LOCATIONS_ALL = `
  query PickupLocationsAll($pageSize: Int!) {
    pickupLocations(pageSize: $pageSize, currentPage: 1) {
      items {
        pickup_location_code
        name
        latitude
        longitude
        country_id
        region
        city
        street
        postcode
        phone
      }
      total_count
    }
  }
`;

export async function renderClosestPickupLocations(
  $container,
  {
    graphqlEndpoint,
    graphqlHeaders = {},
    eventsBus,
    pageSize = 200,
    maxResults = 5,
    storageKey = 'bopis:selectedPickupLocation',
    eventName = 'bopis/pickup-location-selected',
  } = {},
) {
  // Allow an optional same-origin override while testing:
  // <div class="commerce-checkout" data-graphql-endpoint="/graphql">
  // This is NOT hardcoding in JS; it’s a page-level override.
  const override = $container.closest('.commerce-checkout')?.getAttribute('data-graphql-endpoint');
  const effectiveEndpoint = override || graphqlEndpoint;

  $container.innerHTML = `
    <div class="pickup-selector">
      <h2 class="checkout__block">Pick up in store</h2>
      <p class="checkout__block">Use your location to find the closest pickup store.</p>

      <div class="checkout__block pickup-selector__actions">
        <button type="button" class="pickup-selector__geo-btn">Use my location</button>
      </div>

      <div class="checkout__block pickup-selector__status" aria-live="polite"></div>
      <div class="checkout__block pickup-selector__results"></div>
    </div>
  `;

  const $status = $container.querySelector('.pickup-selector__status');
  const $results = $container.querySelector('.pickup-selector__results');
  const $geoBtn = $container.querySelector('.pickup-selector__geo-btn');

  $status.textContent = 'Loading pickup locations…';

  let stores = [];
  let totalItems = 0;
  const buildHeaderCandidates = () => {
    const storeHeader = graphqlHeaders?.Store;
    const candidates = [
      graphqlHeaders,
      storeHeader ? { Store: storeHeader } : null,
      {},
    ].filter(Boolean);

    const seen = new Set();
    return candidates.filter((headers) => {
      const key = JSON.stringify(headers);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  try {
    const headerCandidates = buildHeaderCandidates();
    let items = [];

    for (const headers of headerCandidates) {
      const data = await commerceGraphQL({
        endpoint: effectiveEndpoint,
        headers,
        query: PICKUP_LOCATIONS_ALL,
        variables: { pageSize },
      });

      items = data?.pickupLocations?.items ?? [];
      if (items.length) break;
    }

    totalItems = items.length;
    stores = items
      .map(normalizePickupLocation)
      .filter((s) => s.code);
  } catch (e) {
    $status.textContent = `Couldn’t load pickup locations: ${String(e.message || e)}`;
    return;
  }

  if (!stores.length) {
    $status.textContent = totalItems
      ? 'Pickup locations were returned, but none had a usable location code.'
      : 'No pickup locations available for the current store context. Check stock/source assignment and store headers.';
    return;
  }

  function renderCards(sortedStores, origin) {
    const top = sortedStores.slice(0, maxResults);

    $results.innerHTML = top.map((s) => {
      const dist = (origin && s.hasGeo)
        ? haversineDistanceMiles(origin, { lat: s.lat, lng: s.lng })
        : null;
      const distText = dist != null ? `${dist.toFixed(1)} mi away` : '';

      return `
        <div class="pickup-store-card">
          <div class="pickup-store-card__meta">
            <div class="pickup-store-card__name"><strong>${s.name}</strong></div>
            <div class="pickup-store-card__addr">${formatAddressHtml(s)}</div>
            ${s.phone ? `<div class="pickup-store-card__phone">${s.phone}</div>` : ''}
            ${distText ? `<div class="pickup-store-card__dist">${distText}</div>` : ''}
          </div>
          <div class="pickup-store-card__actions">
            <button type="button" class="pickup-store-card__select" data-code="${s.code}">
              Select this store
            </button>
          </div>
        </div>
      `;
    }).join('');

    $results.querySelectorAll('.pickup-store-card__select').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = btn.getAttribute('data-code');
        const store = stores.find((x) => x.code === code);
        if (!store) return;

        sessionStorage.setItem(storageKey, JSON.stringify(store));
        if (eventsBus) eventsBus.emit(eventName, store);

        $status.textContent = `Selected: ${store.name}`;
      });
    });
  }

  const geoEnabledCount = stores.filter((s) => s.hasGeo).length;
  const geoHint = geoEnabledCount
    ? 'Use your location to sort by closest.'
    : 'Distance sorting is unavailable because these locations do not include usable coordinates.';
  $status.textContent = `Showing ${Math.min(maxResults, stores.length)} pickup locations. ${geoHint}`;
  renderCards(stores, null);

  $geoBtn.addEventListener('click', () => {
    $status.textContent = 'Requesting your location…';

    if (!navigator.geolocation) {
      $status.textContent = 'Geolocation is not supported by this browser.';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!geoEnabledCount) {
          $status.textContent = 'Pickup locations loaded, but distance sorting is unavailable (missing/invalid coordinates).';
          return;
        }

        const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };

        const sorted = [...stores].sort((a, b) => {
          if (!a.hasGeo && !b.hasGeo) return 0;
          if (!a.hasGeo) return 1;
          if (!b.hasGeo) return -1;
          const da = haversineDistanceMiles(origin, { lat: a.lat, lng: a.lng });
          const db = haversineDistanceMiles(origin, { lat: b.lat, lng: b.lng });
          return da - db;
        });

        $status.textContent = `Showing the ${Math.min(maxResults, stores.length)} closest pickup locations.`;
        renderCards(sorted, origin);
      },
      (err) => {
        $status.textContent = `Unable to get your location: ${err.message}`;
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  });
}
