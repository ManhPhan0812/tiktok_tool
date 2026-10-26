(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};
  const endpoint = "https://download.seekin.ai/ikool/media/download";
  const encoder = new TextEncoder();
  const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");

  // Public web-client signing parameters, observed in Seekin's shipped frontend
  // on 2026-10-26. These are shared by anonymous requests, not an account token.
  // Keep the implementation local; never fetch/evaluate remote JavaScript.
  const seed = [81, 126, 91, 189, 251, 6, 125, 91, 232, 23, 172, 71, 137, 207, 234, 102, 104, 193, 132, 209, 111, 228, 140];
  const mask = [55, 66, 156];
  const clientKey = Uint8Array.from(seed, (byte, index) => byte ^ mask[index % mask.length] ^ ((index * 31 + 85) & 255));

  async function hmac(keyBytes, value) {
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return crypto.subtle.sign("HMAC", key, encoder.encode(value));
  }

  function matches(value) {
    try {
      const url = new URL(value);
      return url.origin === new URL(endpoint).origin
        && url.pathname === new URL(endpoint).pathname
        && !url.username && !url.password;
    } catch {
      return false;
    }
  }

  async function headers(url, body, { timestamp = Date.now(), nonce, lang = "vi" } = {}) {
    if (!matches(url)) throw new Error("Không ký yêu cầu ngoài endpoint Seekin.");
    const target = new URL(url);
    const query = [...target.searchParams.entries()]
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, value]) => `${key}=${value}`).join("&");
    const digest = body ? hex(await crypto.subtle.digest("SHA-256", encoder.encode(body))) : "";
    const freshNonce = nonce ?? hex(crypto.getRandomValues(new Uint8Array(16)));
    const payload = ["POST", target.pathname, query, digest, timestamp, freshNonce, lang].join("\n");
    const epochKey = await hmac(clientKey, `v2|${Math.floor(timestamp / 10000)}`);
    return {
      lang,
      timestamp: String(timestamp),
      nonce: freshNonce,
      sign: hex(await hmac(epochKey, payload))
    };
  }

  ns.seekinService = Object.freeze({ endpoint, matches, headers });
})();
