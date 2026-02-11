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
  // These are the commonly documented fields; normalize defensively to avoid breakage
  const code = item.pickup_location_code || item.code || item.source_code || item.sourceCode;
  const name = item.name || item.store_name || item.storeName || code || 'Pickup location';

  const lat = Number(item.latitude ?? item.lat);
  const lng = Number(item.longitude ?? item.lng);

  // "street" may be array or string depending on schema/config
  const street = Array.isArray(item.street)
    ? item.street.filter(Boolean).join(', ')
    : (item.street ?? '');

  return {
    code,
    name,
    lat,
    lng,
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

async function commerceGraphQL({ endpoint, query, variables }) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();

  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));

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

/**
 * Option 3: Show “closest pickup location” cards based on shopper geolocation.
 *
 * This does NOT set the shipping method — it:
 * - emits an event with the chosen location
 * - stores it in sessionStorage
 *
 * You can wire the actual “set pickup location in checkout state” later.
 */
export async function renderClosestPickupLocations(
  $container,
  {
    graphqlEndpoint = '/graphql',
    eventsBus,
    pageSize = 200,
    maxResults = 5,
    storageKey = 'bopis:selectedPickupLocation',
    eventName = 'bopis/pickup-location-selected',
  } = {},
) {
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
  try {
    const data = await commerceGraphQL({
      endpoint: graphqlEndpoint,
      query: PICKUP_LOCATIONS_ALL,
      variables: { pageSize },
    });

    const items = data?.pickupLocations?.items ?? [];
    stores = items
      .map(normalizePickupLocation)
      .filter((s) => s.code && Number.isFinite(s.lat) && Number.isFinite(s.lng));
  } catch (e) {
    $status.textContent = `Couldn’t load pickup locations: ${e.message}`;
    return;
  }

  if (!stores.length) {
    $status.textContent = 'No pickup locations available.';
    return;
  }

  function renderCards(sortedStores, origin) {
    const top = sortedStores.slice(0, maxResults);

    $results.innerHTML = top.map((s) => {
      const dist = origin ? haversineDistanceMiles(origin, { lat: s.lat, lng: s.lng }) : null;
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

  // initial render (no distance)
  $status.textContent = `Showing ${Math.min(maxResults, stores.length)} pickup locations. Use your location to sort by closest.`;
  renderCards(stores, null);

  $geoBtn.addEventListener('click', () => {
    $status.textContent = 'Requesting your location…';

    if (!navigator.geolocation) {
      $status.textContent = 'Geolocation is not supported by this browser.';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };

        const sorted = [...stores].sort((a, b) => {
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
