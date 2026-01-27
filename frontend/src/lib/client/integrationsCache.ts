interface IntegrationConnection {
  id?: string;
  provider?: string;
  connection_id?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface IntegrationsListResponse {
  connections?: IntegrationConnection[];
  [key: string]: unknown;
}

let cachedData: IntegrationsListResponse | null = null;
let lastFetch = 0;
let inFlight: Promise<IntegrationsListResponse> | null = null;
const TTL_MS = 60_000; // 1 minute cache

export function clearIntegrationsCache() {
  cachedData = null;
  lastFetch = 0;
  inFlight = null;
}

export async function getIntegrationsCached(force = false): Promise<IntegrationsListResponse> {
  const now = Date.now();
  if (!force && cachedData && now - lastFetch < TTL_MS) {
    return cachedData;
  }

  // Reuse any in-flight request to avoid duplicate network calls
  if (inFlight) return inFlight;

  inFlight = fetch('/api/integrations/list', { credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) throw new Error(`integrations/list ${res.status}`);
      return res.json();
    })
    .then((data: IntegrationsListResponse) => {
      cachedData = data;
      lastFetch = Date.now();
      return data;
    })
    .catch((err) => {
      cachedData = null;
      throw err;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
