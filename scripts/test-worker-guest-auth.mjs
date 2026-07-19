const GUEST_BASE_URL = process.env.GUEST_BASE_URL || 'https://gps-guest.bruce-group.net';
const OWNER_BASE_URL = process.env.OWNER_BASE_URL || 'https://gps.bruce-group.net';
const GUEST_BASIC_AUTH_USERNAME = process.env.GUEST_BASIC_AUTH_USERNAME || 'guest';
const GUEST_BASIC_AUTH_PASSWORD = process.env.GUEST_BASIC_AUTH_PASSWORD || '';
const REQUIRE_GUEST_PASSWORD = String(process.env.REQUIRE_GUEST_PASSWORD || 'true').toLowerCase() !== 'false';
const EXPECT_OWNER_ACCESS_REDIRECT = String(process.env.EXPECT_OWNER_ACCESS_REDIRECT || 'true').toLowerCase() !== 'false';
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 30000);

const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`FAIL: ${message}`);
}

function ok(message) {
  console.log(`OK: ${message}`);
}

function basicHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function isAccessRedirectLocation(location) {
  if (!location) return false;
  try {
    const parsed = new URL(location, OWNER_BASE_URL);
    return parsed.pathname.startsWith('/cdn-cgi/access/') || parsed.hostname.endsWith('.cloudflareaccess.com');
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: 'manual',
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function expectUnauthorizedBasic(response, label) {
  const authHeader = response.headers.get('WWW-Authenticate') || '';
  const cacheControl = response.headers.get('Cache-Control') || '';
  if (response.status !== 401) fail(`${label}: expected HTTP 401, got ${response.status}`);
  else ok(`${label}: returned HTTP 401`);
  if (!/Basic/i.test(authHeader)) fail(`${label}: missing Basic challenge in WWW-Authenticate`);
  else ok(`${label}: contains Basic challenge`);
  if (!/no-store/i.test(cacheControl)) fail(`${label}: missing Cache-Control: no-store`);
  else ok(`${label}: contains Cache-Control no-store`);
}

async function run() {
  console.log(`Guest host: ${GUEST_BASE_URL}`);
  console.log(`Owner host: ${OWNER_BASE_URL}`);

  const guestRoot = new URL('/', GUEST_BASE_URL).toString();
  const guestUpload = new URL('/api/upload', GUEST_BASE_URL).toString();
  const ownerRoot = new URL('/', OWNER_BASE_URL).toString();

  const guestNoAuth = await fetchWithTimeout(guestRoot, {
    headers: { Accept: 'text/html' },
  });
  expectUnauthorizedBasic(guestNoAuth, 'Guest root without Authorization');

  const guestWrongAuth = await fetchWithTimeout(guestRoot, {
    headers: {
      Accept: 'text/html',
      Authorization: basicHeader(GUEST_BASIC_AUTH_USERNAME, 'wrong-password-for-smoke'),
    },
  });
  expectUnauthorizedBasic(guestWrongAuth, 'Guest root with wrong password');

  const guestUploadNoAuth = await fetchWithTimeout(guestUpload, { method: 'OPTIONS' });
  expectUnauthorizedBasic(guestUploadNoAuth, 'Guest /api/upload without Authorization');

  if (!GUEST_BASIC_AUTH_PASSWORD) {
    const message = 'GUEST_BASIC_AUTH_PASSWORD is empty; skipping positive Basic Auth checks';
    if (REQUIRE_GUEST_PASSWORD) fail(message);
    else console.warn(`WARN: ${message}`);
  } else {
    const authHeader = basicHeader(GUEST_BASIC_AUTH_USERNAME, GUEST_BASIC_AUTH_PASSWORD);

    const guestAuthorizedRoot = await fetchWithTimeout(guestRoot, {
      headers: {
        Accept: 'text/html',
        Authorization: authHeader,
      },
    });
    const guestContentType = guestAuthorizedRoot.headers.get('Content-Type') || '';
    if (guestAuthorizedRoot.status !== 200) fail(`Guest root with correct password: expected HTTP 200, got ${guestAuthorizedRoot.status}`);
    else ok('Guest root with correct password returns HTTP 200');
    if (!/text\/html/i.test(guestContentType)) fail(`Guest root with correct password: expected text/html, got ${guestContentType || 'none'}`);
    else ok('Guest root with correct password returns frontend HTML');

    const guestUploadAuthOptions = await fetchWithTimeout(guestUpload, {
      method: 'OPTIONS',
      headers: { Authorization: authHeader },
    });
    if (guestUploadAuthOptions.status !== 204) fail(`Guest /api/upload OPTIONS with auth: expected HTTP 204, got ${guestUploadAuthOptions.status}`);
    else ok('Guest /api/upload OPTIONS with auth returns HTTP 204');

    const formData = new FormData();
    formData.append('target', 'bundle');
    const guestUploadAuthPost = await fetchWithTimeout(guestUpload, {
      method: 'POST',
      headers: { Authorization: authHeader },
      body: formData,
    });
    if (guestUploadAuthPost.status === 401) fail('Guest /api/upload POST with auth returned 401');
    else ok(`Guest /api/upload POST with auth is reachable (HTTP ${guestUploadAuthPost.status})`);
  }

  const ownerResponse = await fetchWithTimeout(ownerRoot, {
    headers: { Accept: 'text/html' },
  });
  const ownerAuthenticate = ownerResponse.headers.get('WWW-Authenticate') || '';
  if (/Basic/i.test(ownerAuthenticate)) fail('Owner host returned Basic challenge; expected Cloudflare Access flow');
  else ok('Owner host does not return Basic challenge');

  if (EXPECT_OWNER_ACCESS_REDIRECT) {
    const redirectStatuses = new Set([301, 302, 303, 307, 308]);
    const location = ownerResponse.headers.get('Location') || '';
    if (!redirectStatuses.has(ownerResponse.status)) {
      fail(`Owner host: expected redirect status for Cloudflare Access, got ${ownerResponse.status}`);
    } else if (!isAccessRedirectLocation(location)) {
      fail('Owner host: redirect location is not a Cloudflare Access URL');
    } else {
      ok(`Owner host redirects to Cloudflare Access (${ownerResponse.status})`);
    }
  }

  if (failures.length > 0) {
    console.error('\nGuest auth smoke failed:');
    for (const entry of failures) console.error(`- ${entry}`);
    process.exit(1);
  }

  console.log('\nGuest auth smoke passed.');
}

await run();
