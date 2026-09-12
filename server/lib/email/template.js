/**
 * The sign-in code email.
 *
 * Built to the same design tokens as the app (the ground, the card, the green accent, the
 * condensed uppercase eyebrow) so the mail that lets someone in looks like the thing they
 * are being let into.
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
 * Theme: the reader's, where the client says what it is, and dark where it does not. That
 * ordering is what decides the markup. The inline styles are the dark palette, because
 * inline is the one thing every client applies, so Gmail, Outlook for Windows and anything
 * else that drops `<style>` or ignores `prefers-color-scheme` gets dark. The light palette
 * is layered on top from a `prefers-color-scheme: light` query, with `!important` because
 * that is the only way a stylesheet beats an inline style. Declaring `light dark` as the
 * supported schemes tells Apple Mail the message handles both, so it does not invert either.
 *
 * The theme rules sit in their own `<style>` block: a client that rejects one block discards
 * the whole block, and the mobile padding should not be lost along with the theme.
 */

const DARK = {
  bg: '#080a09',
  card: '#121715',
  card2: '#19201d',
  line: '#222a26',
  fg: '#f1f5f2',
  dim: '#8b9792',
  dim2: '#5f6c67',
  accent: '#00e27a',
  accentTxt: '#00e27a',
  accentInk: '#04140b',
};

// The app's [data-theme='light'] tokens from web/src/styles.css.
const LIGHT = {
  bg: '#f2f5f3',
  card: '#ffffff',
  card2: '#edf1ee',
  line: '#e0e6e2',
  fg: '#0b1210',
  dim: '#5b6a64',
  dim2: '#8a9791',
  accent: '#00a757',
  accentTxt: '#007a3f',
  accentInk: '#ffffff',
};

const C = DARK;

const FONT = "'Barlow','Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/** First name only: "Hi Sam Raj Sharma," reads like a form letter. */
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
    'WATCHSHEET / Your season, logged',
    who ? `Hi ${who},` : 'Hi,',
    'Your sign-in code is:',
    `    ${code}`,
    `It expires in ${minutes} minute${minutes === 1 ? '' : 's'} and can only be used once.`,
    'If you did not ask to sign in, you can ignore this email. The code is useless on its own and nobody can reach your account without it.',
    replyTo ? `Replies to this message go to ${replyTo}.` : null,
    'Watchsheet, a private logbook for football.',
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
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(otpSubject(code))}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (max-width:520px) {
    .ws-pad { padding-left:20px !important; padding-right:20px !important; }
    .ws-code { font-size:30px !important; letter-spacing:.18em !important; }
  }
</style>
<style>
  @media (prefers-color-scheme: light) {
    .ws-bg { background:${LIGHT.bg} !important; }
    .ws-card { background:${LIGHT.card} !important; border-color:${LIGHT.line} !important; }
    .ws-well { background:${LIGHT.bg} !important; border-color:${LIGHT.line} !important; }
    .ws-card2 { background:${LIGHT.card2} !important; }
    .ws-badge { background:${LIGHT.accent} !important; }
    .ws-badge-ink { color:${LIGHT.accentInk} !important; }
    .ws-fg { color:${LIGHT.fg} !important; }
    .ws-dim { color:${LIGHT.dim} !important; }
    .ws-dim2 { color:${LIGHT.dim2} !important; }
    .ws-accent { color:${LIGHT.accentTxt} !important; }
  }
</style>
</head>
<body class="ws-bg" style="margin:0;padding:0;background:${C.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">
    ${safeCode} is your Watchsheet code. It expires in ${expiry}.
  </div>

  <table class="ws-bg" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
    <tr>
      <td align="center" style="padding:32px 12px 40px;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;width:100%;">

          <!-- Wordmark: the app header, as type only so nothing has to load. -->
          <tr>
            <td style="padding:0 4px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="46" style="width:46px;">
                    <table class="ws-badge" role="presentation" cellpadding="0" cellspacing="0" border="0" width="46" style="width:46px;height:46px;background:${C.accent};border-radius:13px;">
                      <tr>
                        <td class="ws-badge-ink" align="center" valign="middle" height="46" style="height:46px;font-family:${FONT};font-size:24px;font-weight:800;color:${C.accentInk};line-height:1;">W</td>
                      </tr>
                    </table>
                  </td>
                  <td style="padding-left:12px;font-family:${FONT};">
                    <div class="ws-fg" style="font-size:23px;font-weight:800;letter-spacing:-.03em;color:${C.fg};line-height:1.1;">Watchsheet</div>
                    <div class="ws-accent" style="font-size:10.5px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:${C.accentTxt};padding-top:2px;">Your season, logged</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td class="ws-card" style="background:${C.card};border:1px solid ${C.line};border-radius:20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="ws-pad" style="padding:28px 28px 8px;font-family:${FONT};">
                    <div class="ws-fg" style="font-size:21px;font-weight:800;letter-spacing:-.02em;color:${C.fg};line-height:1.2;">Here is your sign-in code</div>
                    <div class="ws-dim" style="font-size:14.5px;color:${C.dim};padding-top:8px;line-height:1.5;">${greeting} enter these six digits to get into Watchsheet.</div>
                  </td>
                </tr>

                <!-- The code -->
                <tr>
                  <td class="ws-pad" style="padding:20px 28px 0;">
                    <table class="ws-well" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.line};border-radius:14px;">
                      <tr>
                        <td class="ws-code ws-fg" align="center" style="padding:20px 12px;font-family:${MONO};font-size:34px;font-weight:700;letter-spacing:.26em;color:${C.fg};text-indent:.26em;line-height:1.1;">${safeCode}</td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td class="ws-pad ws-dim" align="center" style="padding:12px 28px 0;font-family:${FONT};font-size:12.5px;color:${C.dim};">
                    Expires in ${expiry} · one use only
                  </td>
                </tr>

                <!-- Reassurance -->
                <tr>
                  <td class="ws-pad" style="padding:24px 28px 28px;">
                    <table class="ws-card2" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.card2};border-radius:12px;">
                      <tr>
                        <td class="ws-dim" style="padding:13px 15px;font-family:${FONT};font-size:12.5px;color:${C.dim};line-height:1.55;">
                          Did not ask for this? You can ignore it. The code is useless on its own, and nobody can reach your account without it.
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
            <td class="ws-dim2" style="padding:20px 8px 0;font-family:${FONT};font-size:11.5px;color:${C.dim2};line-height:1.6;">
              Watchsheet, a private logbook for football. One tap to mark a match watched.
              ${replyTo ? `<br>Replies to this message go to <span class="ws-dim" style="color:${C.dim};">${escapeHtml(replyTo)}</span>.` : ''}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
