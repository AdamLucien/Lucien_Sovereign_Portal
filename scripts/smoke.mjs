const BASE_URL = 'http://localhost:3000';
const ENGAGEMENT_ID = 'PRJ-001';

const normalizeCode = (value) => {
  if (!value) return '';
  return String(value)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const getJson = async (response) => {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;
  return response.json();
};

const fetchWithCookie = async (path, init, cookie) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(cookie ? { cookie } : {}),
    },
  });

  const json = await getJson(response);
  return { response, json };
};

const run = async () => {
  console.log('1) Dev login');
  const login = await fetch(`${BASE_URL}/api/dev/login`);
  const setCookie = login.headers.get('set-cookie');
  assert(login.status === 200, `Expected 200, got ${login.status}`);
  assert(setCookie && setCookie.includes('lucien_session='), 'Missing lucien_session cookie');
  const sessionCookie = setCookie.split(';')[0];
  console.log('   OK');

  console.log('2) Intel list');
  const intelList = await fetchWithCookie(
    `/api/engagements/${ENGAGEMENT_ID}/intel`,
    { method: 'GET' },
    sessionCookie,
  );
  assert(intelList.response.status === 200, `Expected 200, got ${intelList.response.status}`);
  assert(Array.isArray(intelList.json), 'Expected JSON array');
  const ids = intelList.json.map((item) => item.id);
  assert(ids.includes('REQ-2026-0001'), 'Missing REQ-2026-0001');
  assert(ids.includes('REQ-2026-0002'), 'Missing REQ-2026-0002');
  console.log('   OK');

  console.log('3) Upload small file');
  const smallForm = new FormData();
  const smallBuffer = Buffer.alloc(1024 * 8, 1);
  smallForm.append('file', new Blob([smallBuffer]), 'small.bin');
  smallForm.append('requestId', 'REQ-2026-0001');

  const smallUpload = await fetchWithCookie(
    `/api/engagements/${ENGAGEMENT_ID}/intel/upload`,
    { method: 'POST', body: smallForm },
    sessionCookie,
  );
  assert(smallUpload.response.status === 200, `Expected 200, got ${smallUpload.response.status}`);
  const smallSignal =
    smallUpload.json?.signal ??
    (smallUpload.json?.status === 'accepted' ? 'INTEL_RECEIVED' : undefined);
  assert(
    smallSignal === 'INTEL_RECEIVED',
    `Expected signal INTEL_RECEIVED, got ${smallSignal ?? 'none'}`,
  );
  console.log('   OK');

  console.log('4) Upload 51MB file');
  const bigForm = new FormData();
  const bigBuffer = Buffer.alloc(51 * 1024 * 1024, 0);
  bigForm.append('file', new Blob([bigBuffer]), 'big.bin');
  bigForm.append('requestId', 'REQ-2026-0001');

  const bigUpload = await fetchWithCookie(
    `/api/engagements/${ENGAGEMENT_ID}/intel/upload`,
    { method: 'POST', body: bigForm },
    sessionCookie,
  );
  assert(bigUpload.response.status === 413, `Expected 413, got ${bigUpload.response.status}`);
  const code = normalizeCode(bigUpload.json?.code ?? bigUpload.json?.error);
  assert(code === 'PAYLOAD_TOO_LARGE', `Expected PAYLOAD_TOO_LARGE, got ${code || 'none'}`);
  console.log('   OK');

  console.log('\nSmoke tests passed.');
};

run().catch((error) => {
  console.error(`\nSmoke tests failed: ${error.message}`);
  process.exit(1);
});
