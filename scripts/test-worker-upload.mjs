const WORKER_URL = process.env.WORKER_URL || 'https://spring-mouse-8d81.dvabobra2014.workers.dev/';
const TARGETS = (process.env.TARGETS || 'umbphotos,ninjabox')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const REQUIRE_MODE = process.env.REQUIRE_MODE || 'all'; // all | any

// Smoke test marker: trigger workflow after enabling push event.
// 1x1 JPEG. Enough for testing multipart upload without committing real photos.
const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z';

const makeTestFile = () => {
  const bytes = Uint8Array.from(Buffer.from(JPEG_BASE64, 'base64'));
  return new File([bytes], `worker-smoke-${Date.now()}.jpg`, { type: 'image/jpeg' });
};

async function testTarget(target) {
  const formData = new FormData();
  formData.append('target', target);
  formData.append('file', makeTestFile());

  const started = Date.now();
  let response;
  let text;

  try {
    response = await fetch(WORKER_URL, {
      method: 'POST',
      body: formData,
    });
    text = await response.text();
  } catch (error) {
    return {
      target,
      ok: false,
      networkError: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
    };
  }

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  return {
    target,
    ok: Boolean(response.ok && data?.ok && data?.url),
    httpStatus: response.status,
    durationMs: Date.now() - started,
    url: data?.url || null,
    response: data || text.slice(0, 4000),
  };
}

const results = [];
for (const target of TARGETS) {
  console.log(`Testing ${target} via ${WORKER_URL}`);
  const result = await testTarget(target);
  results.push(result);
  console.log(JSON.stringify(result, null, 2));
}

console.log('SMOKE_TEST_SUMMARY_BEGIN');
for (const result of results) {
  console.log(`${result.ok ? 'OK' : 'FAIL'} ${result.target} status=${result.httpStatus ?? 'network'} durationMs=${result.durationMs} url=${result.url || '-'}`);
}
console.log('SMOKE_TEST_SUMMARY_END');

const anyOk = results.some((result) => result.ok);
const allOk = results.every((result) => result.ok);

if (REQUIRE_MODE === 'any') {
  if (!anyOk) {
    console.error('All Worker upload targets failed. See JSON responses above.');
    process.exit(1);
  }
  console.log('At least one Worker upload target works.');
} else {
  if (!allOk) {
    console.error('One or more Worker upload targets failed. See JSON responses above.');
    process.exit(1);
  }
  console.log('All Worker upload targets work.');
}
