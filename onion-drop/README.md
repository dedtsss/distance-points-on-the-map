# onion-drop

Minimal Onion Service photo drop. The Node API binds to `127.0.0.1:8787`; Tor forwards the onion port 80 to it. No public port should be published from the container. Keep `/var/lib/tor` private and persistent; the generated onion hostname is there. `/var/lib/onion-drop` holds only ephemeral JPEGs.

Run `npm test` for the local API. For later anonymous-host deployment, build `docker build -t onion-drop .` and run it with private volumes for `/var/lib/tor` and `/var/lib/onion-drop`, without `-p`. The deployment host must be identified and preflighted in a separate task.

`POST /v1/shares` accepts a JPEG body up to 12 MiB and returns a relative view path. `GET /v1/shares/:id` serves a page with an explicit Open photo button. Its `POST /view` starts the viewed timer and issues a random token for `GET /image`. Raw GET requests, previews, and ranges cannot start the timer or fetch the image before that action. Default unopened TTL is 24 hours; default TTL after first intentional view is one hour, capped by the unopened expiry. State is memory-only; restart invalidates links and removes stored images. There are no accounts or application request logs.
