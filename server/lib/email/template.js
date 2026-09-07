/**
 * The sign-in code email.
 *
 * Built to the same design tokens as the app — the dark ground, the card, the green accent,
 * the condensed uppercase eyebrow — so the mail that lets someone in looks like the thing
 * they are being let into.
 *
 * Email is not the web, so the constraints are different and drive the markup:
 *   - tables and inline styles, because Outlook renders with Word and ignores modern CSS;
 *   - no images at all, so nothing depends on a remote fetch a client may block. The badge
 *     is the app's own monogram fallback, drawn as a table cell;
 *   - a hidden preheader, or the client previews whatever text comes first;
 *   - the code repeated in the subject, so it is readable from a notification without
 *     opening anything;
 *   - a plain-text alternative that stands on its own.
 *
 * Dark mode is left to the client: the palette is already dark and stated explicitly, and
 * `color-scheme` asks clients not to invert it.
 */

const C = {
  bg: '#080a09',
  card: '#121715',
  card2: '#19201d',
  line: '#222a26',
  fg: '#f1f5f2',
  dim: '#8b9792',
  dim2: '#5f6c67',
  accent: '#00e27a',
  accentInk: '#04140b',
};

const FONT = "'Barlow','Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/** First name only — "Hi Sam Raj Sharma," reads like a form letter. */
function firstName(name) {
  const first = String(name ?? '').trim().split(/\s+/)[0];
  return first && first.length <= 24 ? escapeHtml(first) : '';
}

export function otpSubject(code) {
  return `${code} is your Watchsheet sign-in code`;
}

export function otpText({ name, code, minutes, replyTo }) {
  const who = String(name ?? '').trim().split(/\s+/)[0];
  const blocks = [
    'WATCHSHEET — Your season, logged',
    who ? `Hi ${who},` : 'Hi,',
    'Your sign-in code is:',
    `    ${code}`,
    `It expires in ${minutes} minute${minutes === 1 ? '' : 's'} and can only be used once.`,
    'If you did not ask to sign in, you can ignore this email. The code is useless on its own and nobody can reach your account without it.',
    replyTo ? `Replies to this message go to ${replyTo}.` : null,
    'Watchsheet — a private logbook for football.',
  ];
  return blocks.filter(Boolean).join('\n\n');
}

export function otpHtml({ name, code, minutes, replyTo }) {
  const greeting = firstName(name) ? `Hi ${firstName(name)},` : 'Hi,';
  const safeCode = escapeHtml(code);
  const expiry = `${minutes} minute${minutes === 1 ? '' : 's'}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(otpSubject(code))}</title>
<style>
  @media (max-width:520px) {
    .ws-pad { padding-left:20px !important; padding-right:20px !important; }
    .ws-code { font-size:30px !important; letter-spacing:.18em !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">
    ${safeCode} is your Watchsheet code. It expires in ${expiry}.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
    <tr>
      <td align="center" style="padding:32px 12px 40px;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;width:100%;">

          <!-- Wordmark: the app header, as type only so nothing has to load. -->
          <tr>
            <td style="padding:0 4px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="46" style="width:46px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="46" style="width:46px;height:46px;background:${C.accent};border-radius:13px;">
                      <tr>
                        <td align="center" valign="middle" height="46" style="height:46px;font-family:${FONT};font-size:24px;font-weight:800;color:${C.accentInk};line-height:1;">W</td>
                      </tr>
                    </table>
                  </td>
                  <td style="padding-left:12px;font-family:${FONT};">
                    <div style="font-size:23px;font-weight:800;letter-spacing:-.03em;color:${C.fg};line-height:1.1;">Watchsheet</div>
                    <div style="font-size:10.5px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:${C.accent};padding-top:2px;">Your season, logged</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:${C.card};border:1px solid ${C.line};border-radius:20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="ws-pad" style="padding:28px 28px 8px;font-family:${FONT};">
                    <div style="font-size:21px;font-weight:800;letter-spacing:-.02em;color:${C.fg};line-height:1.2;">Here is your sign-in code</div>
                    <div style="font-size:14.5px;color:${C.dim};padding-top:8px;line-height:1.5;">${greeting} enter these six digits to get into Watchsheet.</div>
                  </td>
                </tr>

                <!-- The code -->
                <tr>
                  <td class="ws-pad" style="padding:20px 28px 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.line};border-radius:14px;">
                      <tr>
                        <td class="ws-code" align="center" style="padding:20px 12px;font-family:${MONO};font-size:34px;font-weight:700;letter-spacing:.26em;color:${C.fg};text-indent:.26em;line-height:1.1;">${safeCode}</td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td class="ws-pad" align="center" style="padding:12px 28px 0;font-family:${FONT};font-size:12.5px;color:${C.dim2};">
                    Expires in ${expiry} · one use only
                  </td>
                </tr>

                <!-- Reassurance -->
                <tr>
                  <td class="ws-pad" style="padding:24px 28px 28px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.card2};border-radius:12px;">
                      <tr>
                        <td style="padding:13px 15px;font-family:${FONT};font-size:12.5px;color:${C.dim};line-height:1.55;">
                          Did not ask for this? You can ignore it — the code is useless on its own and nobody can reach your account without it.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 8px 0;font-family:${FONT};font-size:11.5px;color:${C.dim2};line-height:1.6;">
              Watchsheet — a private logbook for football. One tap to mark a match watched.
              ${replyTo ? `<br>Replies to this message go to <span style="color:${C.dim};">${escapeHtml(replyTo)}</span>.` : ''}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
