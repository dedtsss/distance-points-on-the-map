# Provider Privacy Audit

Date: 2026-07-16

Scope: Cloudflare Worker outbound upload requests to Freeimage, Ninjabox, and x0.

Production deployment: not performed.

## Before

Provider adapters used a unique application User-Agent:

```text
GPS-Checker-Map-Photo/1.0
```

That value made upload traffic from the Worker easy to identify across Freeimage, Ninjabox, and x0.

The browser did not upload directly to providers. It uploaded cleaned files to same-origin `/api/upload`; the Worker then uploaded to providers.

## After

Provider requests are built from a fixed allowlist in `workers/host-proxy/privacyHeaders.js`.

The Worker does not pass through browser request headers to providers. Provider adapters build their own headers and do not receive the original browser `Request`.

Generic browser-like headers are used instead of the app-specific User-Agent:

```text
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36
Accept-Language: en-US,en;q=0.9
DNT: 1
```

HTML/form flows use:

```text
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
```

API/plain-text flows use:

```text
Accept: application/json,text/plain,*/*
Accept: text/plain,application/json;q=0.9,*/*;q=0.8
```

Ninjabox upload includes:

```text
Referer: https://ninjabox.org/
```

Only the provider-specific adapter adds that Referer.

## Forbidden Headers

Provider headers must not include:

- `Authorization`
- `Cookie`
- `CF-Access-Client-Id`
- `CF-Access-Client-Secret`
- `CF-Authorization`
- `CF-Connecting-IP`
- `True-Client-IP`
- `X-Forwarded-For`
- `X-Real-IP`
- user browser `User-Agent`
- user browser `Accept-Language`

Tests cover the sensitive header names and the removal of `GPS-Checker-Map-Photo`.

## Provider Filenames

Internal cleaned files can still be named:

```text
gps-001.jpg
gps-002.jpg
```

Outbound provider uploads now use neutral names:

```text
image-<short-random>.jpg
image-<short-random>.png
```

The frontend mapping is still based on `photoId`, not provider filename. The Worker response can keep internal `fileName` for the UI, while providers see only neutral filenames.

## Debug Audit Helper

`buildProviderPrivacyAudit(provider, mode, headers, formFields)` reports:

- provider name;
- header names and non-secret values;
- forbidden header names if any;
- form field names;
- outbound filename, MIME type, and size for file fields.

It does not log:

- file contents;
- image bytes;
- Cloudflare Access headers;
- cookies;
- authorization tokens;
- form field values such as provider API keys.

## Tests

Added coverage in `scripts/test-upload-routing.mjs`:

- provider headers do not contain `GPS-Checker-Map-Photo`;
- provider headers do not contain `Authorization`, `Cookie`, or `CF-Access-*`;
- Freeimage/Ninjabox/x0 outbound `FormData` filenames do not contain `gps-001` or `gps-002`;
- outbound provider filenames use neutral `image-...` names;
- `photoId` mapping remains stable;
- upload links still map to the expected photo records.

## Remaining Privacy Considerations

This change reduces application-level fingerprinting in outbound provider requests.

It does not hide Cloudflare Worker egress characteristics from providers. Providers can still observe:

- Cloudflare network egress IP ranges;
- timing patterns;
- file sizes;
- image dimensions and visual content;
- selected provider mix.

An egress gateway, residential proxy, or Tor-style routing would be a separate next step if the goal is to hide Cloudflare egress identity. That step has reliability and provider-abuse tradeoffs and should be tested separately before production use.
