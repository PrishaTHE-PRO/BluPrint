// safeRequest.js — HTTP agents that refuse to connect to private addresses.
//
// Both outbound-fetch features (the image proxy and the Pinterest scraper) take
// a URL from the caller, so both were server-side request forgery: "https://"
// was the only thing being checked, and 169.254.169.254, 127.0.0.1 and every
// RFC1918 address were reachable from the internet through our server.
//
// The guard lives in the DNS lookup rather than in a URL check on the way in,
// which matters for two reasons:
//   - Redirects. axios opens a fresh connection per hop, so every hop is
//     re-checked. Validating only the URL the user submitted would let an
//     attacker-controlled host 302 straight to the metadata endpoint.
//   - DNS rebinding. The address is checked at connect time, not at parse time,
//     so a hostname that resolves public-then-private gains nothing.

const dns = require("dns");
const net = require("net");
const http = require("http");
const https = require("https");

/** True for anything that is not a routable public address — refuse by default. */
function isBlockedAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0) return true;                        // "this" network
    if (a === 10) return true;                       // RFC1918
    if (a === 127) return true;                      // loopback
    if (a === 169 && b === 254) return true;         // link-local — cloud metadata lives here
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true;         // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true;                       // multicast + reserved
    return false;
  }

  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    if (s === "::" || s === "::1") return true;      // unspecified / loopback
    if (s.startsWith("fc") || s.startsWith("fd")) return true; // unique local
    if (s.startsWith("fe80")) return true;           // link-local
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
    if (mapped) return isBlockedAddress(mapped[1]);  // IPv4-mapped IPv6
    return false;
  }

  return true; // unparseable — refuse
}

/** dns.lookup that errors out when a hostname resolves anywhere private. */
function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err);

    const addresses = Array.isArray(address) ? address : [{ address, family }];
    for (const entry of addresses) {
      if (isBlockedAddress(entry.address)) {
        const blocked = new Error(`Refusing to connect to private address ${entry.address}`);
        blocked.code = "EBLOCKEDADDR";
        return callback(blocked);
      }
    }
    callback(null, address, family);
  });
}

const httpAgent = new http.Agent({ lookup: guardedLookup });
const httpsAgent = new https.Agent({ lookup: guardedLookup });

/**
 * Throws unless `raw` is an http(s) URL pointing at a public address.
 *
 * The agent's guarded lookup is NOT enough on its own: when the host is already
 * a literal IP, Node skips dns.lookup and connects straight out, so
 * http://127.0.0.1:5000/ sails past it. (An end-to-end test caught this — the
 * proxy returned 200 and the internal service logged a hit.) Literal addresses
 * have to be checked here, before the request is made.
 */
function assertPublicUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    const err = new Error("Invalid url");
    err.code = "EBADURL";
    throw err;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    const err = new Error("Only http(s) urls are allowed");
    err.code = "EBADPROTO";
    throw err;
  }

  // URL keeps the brackets on IPv6 literals; net.isIP does not want them.
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && isBlockedAddress(host)) {
    const err = new Error(`Refusing to connect to private address ${host}`);
    err.code = "EBLOCKEDADDR";
    throw err;
  }

  return parsed;
}

module.exports = { httpAgent, httpsAgent, isBlockedAddress, guardedLookup, assertPublicUrl };
