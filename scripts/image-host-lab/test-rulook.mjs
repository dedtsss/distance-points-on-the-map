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
    if (/upload_files/i.test(url.pathname)) return false;
    if (/\/(?:api|assets?|static|favicon|updates|poll)(?:\/|$)/i.test(url.pathname)) return false;
    if (/\.(?:js|css|svg|woff2?|ico|png|jpe?g|webp)$/i.test(url.pathname) && !url.hash) return false;
    return true;
  } catch {
    return false;
  }
};

const candidatePriority = (value) => {
  try {
    return /^\/files\/[^/]+\/?$/i.test(new URL(value).pathname) ? 0 : 1;
  } catch {
    return 9;
  }
};

const verifyViewer = async (browser, url) => {
  const attempts = [];
  for (let index = 0; index < 2; index += 1) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(4_000);
      const bodyText = await page.locator('body').innerText().catch(() => '');
      const finalUrl = page.url();
      const genericFilesPage = /^https:\/\/rulook\.cc\/(?:ru|en)\/files\/?$/i.test(finalUrl);
      attempts.push({
        status: response?.status() || null,
        finalUrl,
        title: await page.title(),
        bodyLength: bodyText.length,
        bodyText: bodyText.slice(0, 1_000),
        imageCount: await page.locator('img').count(),
        genericFilesPage,
        links: await page.locator('a[href]').evaluateAll((nodes) => nodes.slice(0, 20).map((node) => node.href)),
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
      Number(attempt.status) >= 200
      && Number(attempt.status) < 400
      && !attempt.error
      && !attempt.genericFilesPage
      && (attempt.imageCount > 0 || /скач|download|файл|file/i.test(attempt.bodyText || ''))
    )),
  };
};

const disableEncryption = async (page) => {
  const labels = page.locator('label');
  const labelCount = await labels.count();
  for (let index = 0; index < labelCount; index += 1) {
    const label = labels.nth(index);
    const text = await label.innerText().catch(() => '');
    if (!/сквозное шифрование|end[- ]to[- ]end encryption/i.test(text)) continue;
    const checkbox = label.locator('input[type="checkbox"]').first();
    if (await checkbox.count() > 0) {
      if (await checkbox.isChecked().catch(() => false)) await checkbox.uncheck({ force: true });
      return !(await checkbox.isChecked().catch(() => true));
    }
  }

  const encryptionText = page.getByText(/сквозное шифрование|end[- ]to[- ]end encryption/i).first();
  if (await encryptionText.count() > 0) {
    const container = encryptionText.locator('xpath=ancestor::*[.//input[@type="checkbox"]][1]');
    const checkbox = container.locator('input[type="checkbox"]').first();
    if (await checkbox.count() > 0) {
      if (await checkbox.isChecked().catch(() => false)) await checkbox.uncheck({ force: true });
      return !(await checkbox.isChecked().catch(() => true));
    }
  }
  return false;
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
  encryptionDisabled: false,
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
let finishSeenAt = 0;

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
      if (/\/api\/finish-upload\//i.test(response.url()) && response.ok()) finishSeenAt = Date.now();
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
  report.encryptionDisabled = await disableEncryption(page);

  const fileInput = page.locator('input[type="file"]').first();
  report.fileInputFound = await fileInput.count() > 0;
  if (!report.fileInputFound) {
    report.reason = 'The public page did not expose a browser file input.';
  } else if (!report.encryptionDisabled) {
    report.reason = 'The lab could not disable end-to-end encryption before upload.';
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

    const deadline = Date.now() + 55_000;
    while (Date.now() < deadline) {
      discoveredUrls.add(page.url());
      const domValues = await page.locator('a[href], input[value], textarea').evaluateAll((nodes) => nodes.flatMap((node) => [
        node.href || '',
        node.value || '',
        node.textContent || '',
      ]));
      domValues.forEach((value) => urlsFromValue(value, discoveredUrls));
      if (finishSeenAt > 0 && Date.now() - finishSeenAt >= 7_000) break;
      await page.waitForTimeout(1_000);
    }

    report.finalPageUrl = page.url();
    const snapshot = await page.evaluate(() => ({
      bodyText: document.body?.innerText?.slice(0, 4_000) || '',
      anchors: [...document.querySelectorAll('a[href]')].slice(0, 30).map((node) => ({
        text: node.textContent?.trim() || '',
        href: node.href || '',
      })),
      buttons: [...document.querySelectorAll('button')].slice(0, 30).map((node) => ({
        text: node.textContent?.trim() || '',
        title: node.title || '',
        ariaLabel: node.getAttribute('aria-label') || '',
      })),
      inputs: [...document.querySelectorAll('input, textarea')].slice(0, 30).map((node) => ({
        type: node.type || node.tagName.toLowerCase(),
        name: node.name || '',
        value: node.value || '',
        placeholder: node.placeholder || '',
        checked: node.type === 'checkbox' ? node.checked : undefined,
      })),
    }));
    report.domSnapshot = snapshot;
    urlsFromValue(report.finalPageUrl, discoveredUrls);
    urlsFromValue(snapshot, discoveredUrls);
    report.apiResponses.forEach((item) => urlsFromValue(item.body, discoveredUrls));

    report.candidateUrls = [...discoveredUrls]
      .filter(isCandidateShareUrl)
      .sort((left, right) => candidatePriority(left) - candidatePriority(right))
      .slice(0, 10);
    if (report.candidateUrls.length === 0) {
      report.reason = 'Upload API calls completed, but no reusable share URL was exposed to the final page or API response.';
    } else {
      report.verification = await verifyViewer(browser, report.candidateUrls[0]);
      if (report.verification.repeatOpen) {
        report.verdict = 'PASS_VIEWER';
        report.reason = 'The unencrypted viewer URL opened in two clean browser contexts.';
      } else {
        report.reason = 'The unencrypted candidate URL did not open reliably in two clean browser contexts.';
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
