# Paper-Trading App

> README in progress — only the live-data upgrade path is filled in for now.

## Future upgrades

### Live-data transport (push instead of poll)

Live prices flow over **two independent hops**, each of which can be poll or push:

| Design | Upstream (server ↔ Kalshi) | Downstream (server ↔ browser) | End-to-end staleness |
|---|---|---|---|
| **Current (v1)** | REST poll (`PRICE_TTL` ~1s) | SWR poll (`POLL_INTERVAL` ~2s) | ~3s worst case |
| **+ SSE downstream** | REST poll | **SSE push** | ~1s — removes the client poll interval |
| **Full real-time** | **Kalshi WebSocket push** | SSE / WebSocket push | sub-second, no rate limits |

v1 polls on both hops deliberately: zero credentials, minimal moving parts, and 1–2s freshness
is imperceptible for paper trading. The upgrade order:

1. **SSE downstream (ungated — could do today).** Push server → browser instead of per-client
   polling. ~Halves worst-case staleness and collapses N polling clients into one server loop
   pushing deltas (a real server-scale and bandwidth win). Ceiling: it **cannot** beat the
   upstream freshness floor — pushing faster than we learn of changes isn't possible. Cost: a
   server-side poll loop to drive the pushes, plus a deploy that allows long-lived connections
   (Fly does; serverless would time the stream out).
2. **Kalshi WebSocket upstream (gated — needs an API key).** Kalshi's real-time feed
   (`ticker` / `orderbook_delta` channels) requires an authenticated, RSA-signed session; the
   public access we use is REST-only. Subscribing one server-side WebSocket gives sub-second
   source data, removes the upstream poll interval, and sidesteps REST rate limits entirely.

Only the **upstream** hop is gated — the downstream SSE win is fully ours and available now. The
dramatic real-time experience needs both hops on push.
