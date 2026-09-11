/**
 * Who a request actually came from.
 *
 * Behind Cloudflare and Traefik the socket belongs to the nearest proxy, so the real address
 * has to come out of a header. Cloudflare sets CF-Connecting-IP to the client it accepted the
 * connection from, which is one value rather than a list to be counted through, so it is
 * preferred. Everything else falls back to req.ip, which Express derives from
 * X-Forwarded-For according to the `trust proxy` hop count.
 *
 * Both are only as trustworthy as the path in front of the app: a caller who can reach the
 * origin directly can put whatever it likes in either header. That is a reason to keep the
 * origin reachable only through the proxy, not a reason to skip the limit, which exists to
 * stop a scripted caller cycling addresses through a real mail provider.
 */
export function clientIp(req) {
  const cf = req.get('cf-connecting-ip');
  if (cf) return cf.trim();
  return req.ip || req.socket?.remoteAddress || '';
}
