import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const SITE_URL = 'https://rulook.cc/';
const ARTIFACT_PATH = path.resolve('artifacts/rulook-lab/result.json');
const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZVb0AAAAASUVORK5CYII=',
  'base64',
);

const addUrlCandidate = (value, output) => {
  const text = String(value || '').trim();
  if (!text || /[`${}]/.test(text)) return;
  try {
    if (/^https?:\/\//i.test(text)) output.add(new URL(text).toString());
    else if (/^\/[a-z0-9]/i.test(text)) output.add(new URL(text, SITE_URL).toString());
  } catch {
    // Not a URL candidate.
  }
};

const urlsFromValue = (value, output = new Set()) => {
  if (typeof value === 'string') {
    addUrlCandidate(value, output);
    for (const match of value.matchAll(/https?:\/\/[^\s"'<>]+/g)) addUrlCandidate(match[0], output);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => urlsFromValue(item, output));
    return output;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => urlsFromValue(item, output));
  }
  return output;
};

const isCandidateShareUrl = (value) => {
  if (/[`${}]/.test(String(value || ''))) return false;
  try {
    const url = new URL(value);
    if (!/(^|\.)rulook\.cc$/i.test(url.hostname)) return false;
    if (url.pathname === '/' && !url.hash) return false;
    if (/^\/(?:ru|en)?\/?(?:files)?\/?$/i.test(url.pathname) && !url.hash) return false;
    if (/\/(?:api|assets?|static|favicon|updates|poll)(?:\/|$)/i.test(url.pathname)) return false;
    if (/\.(?:js|css|svg|woff2?|ico)$/i.test(url.pathname) && !url.hash) return false;
    return true;
  } catch {
    return false;
  }
};

const verifyViewer = async (browser, url) => {
  const attempts = [];
  for (let index = 0; index < 2; index += 1) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(3_000);
      const bodyText = await page.locator('body').innerText().catch(() => '');
      attempts.push({
        status: response?.status() || null,
        finalUrl: page.url(),
        title: await page.title(),
        bodyLength: bodyText.length,
        imageCount: await page.locator('img').count(),
      });
    } catch (error) {
      attempts.push({ error: error.message });
    } finally {
      await context.close();
    }
  }
  return {
    attempts,
    repeatOpen: attempts.length === 2 && attempts.every((attempt) => (
      Number(attempt.status) >= 200 && Number(attempt.status) < 400 && !attempt.error
    )),
  };
};

const root = await mkdtemp(path.join(os.tmpdir(), 'rulook-lab-'));
const fixturePath = path.join(root, `rulook-lab-${Date.now()}.png`);
await writeFile(fixturePath, pngBytes);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const report = {
  provider: 'rulook',
  generatedAt: new Date().toISOString(),
  siteUrl: SITE_URL,
  pageStatus: null,
  title: '',
  fileInputFound: false,
  uploadControlClicked: '',
  networkPosts: [],
  apiResponses: [],
  finalPageUrl: '',
  domSnapshot: null,
  candidateUrls: [],
  verification: null,
  verdict: 'FAIL',
  reason: '',
};
const discoveredUrls = new Set();

page.on('request', (request) => {
  if (request.method() === 'POST') report.networkPosts.push(request.url());
});
page.on('response', async (response) => {
  const contentType = response.headers()['content-type'] || '';
  if (!/json|text|javascript|html/i.test(contentType)) return;
  try {
    const text = await response.text();
    if (/rulook\.cc\/api\//i.test(response.url())) {
      report.apiResponses.push({
        url: response.url(),
        status: response.status(),
        contentType,
        body: text.slice(0, 4_000),
      });
    }
    urlsFromValue(text, discoveredUrls);
    try { urlsFromValue(JSON.parse(text), discoveredUrls); } catch { /* not JSON */ }
  } catch {
    // Streaming and opaque responses are not required for this lab.
  }
});

try {
  const response = await page.goto(SITE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  report.pageStatus = response?.status() || null;
  report.title = await page.title();
  await page.waitForTimeout(2_000);

  const fileInput = page.locator('input[type="file"]').first();
  report.fileInputFound = await fileInput.count() > 0;
  if (!report.fileInputFound) {
    report.reason = 'The public page did not expose a browser file input.';
  } else {
    await fileInput.setInputFiles(fixturePath);
    await page.waitForTimeout(1_500);

    const controls = page.getByRole('button', { name: /upload|загруз|share|подел|закончить/i });
    const controlCount = await controls.count();
    for (let index = 0; index < controlCount; index += 1) {
      const control = controls.nth(index);
      if (await control.isVisible().catch(() => false) && await control.isEnabled().catch(() => false)) {
        report.uploadControlClicked = (await control.innerText().catch(() => 'button')).trim();
        await control.click();
        break;
      }
    }

    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      discoveredUrls.add(page.url());
      const domValues = await page.locator('a[href], input[value], textarea').evaluateAll((nodes) => nodes.flatMap((node) => [
        node.href || '',
        node.value || '',
        node.textContent || '',
      ]));
      domValues.forEach((value) => urlsFromValue(value, discoveredUrls));
      if ([...discoveredUrls].some(isCandidateShareUrl)) break;
      await page.waitForTimeout(1_000);
    }

    report.finalPageUrl = page.url();
    const snapshot = await page.evaluate(() => ({
      bodyText: document.body?.innerText?.slice(0, 4_000) || '',
      anchors: [...document.querySelectorAll('a[href]')].slice(0, 30).map((node) => ({
        text: node.textContent?.trim() || '',
        href: node.href || '',
      })),
      inputs: [...document.querySelectorAll('input, textarea')].slice(0, 30).map((node) => ({
        type: node.type || node.tagName.toLowerCase(),
        name: node.name || '',
        value: node.value || '',
        placeholder: node.placeholder || '',
      })),
    }));
    report.domSnapshot = snapshot;
    urlsFromValue(report.finalPageUrl, discoveredUrls);
    urlsFromValue(snapshot, discoveredUrls);
    report.apiResponses.forEach((item) => urlsFromValue(item.body, discoveredUrls));

    report.candidateUrls = [...discoveredUrls].filter(isCandidateShareUrl).slice(0, 10);
    if (report.candidateUrls.length === 0) {
      report.reason = 'Upload API calls completed, but no reusable share URL was exposed to the page or API response.';
    } else {
      report.verification = await verifyViewer(browser, report.candidateUrls[0]);
      if (report.verification.repeatOpen) {
        report.verdict = 'PARTIAL';
        report.reason = 'A viewer URL opened twice, but direct-image/API compatibility is not proven.';
      } else {
        report.reason = 'A candidate URL was found but did not open reliably in two clean browser contexts.';
      }
    }
  }
} catch (error) {
  report.reason = error.message;
} finally {
  await browser.close();
  await rm(root, { recursive: true, force: true });
}

await mkdir(path.dirname(ARTIFACT_PATH), { recursive: true });
await writeFile(ARTIFACT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(`RULOOK_LAB_RESULT ${JSON.stringify(report)}`);
if (report.verdict === 'FAIL') process.exitCode = 2;
