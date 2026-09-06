import { config } from '../../config.js';

/**
 * Resend provider — the integration point for live sending, intentionally not switched on.
 *
 * Deployment plan this is written against: the domain is hosted on another mail host (which keeps
 * the MX records and receives replies), and Resend does the outbound sending for that same
 * domain. Those two coexist — MX and sending authentication are separate records — but
 * Resend still has to be authorised to send as the domain.
 *
 * To turn it on:
 *   1. Add the domain in Resend and publish the DKIM CNAME records it gives you.
 *   2. Add Resend to the domain's SPF TXT record, keeping another mail host's include intact:
 *        v=spf1 include:another mail host.com include:amazonses.com ~all
 *      (Resend sends over Amazon SES; confirm the exact include in the Resend dashboard.)
 *   3. Leave the MX records pointing at another mail host so inbound mail is unaffected.
 *   4. Set RESEND_API_KEY and MAIL_FROM (an address on the verified domain), then
 *      MAIL_PROVIDER=resend.
 *
 * Nothing here runs until those are set: `configured` is false and sendOtp throws.
 */

const ENDPOINT = 'https://api.resend.com/emails';

export class NotConfiguredError extends Error {
  constructor(missing) {
    super(`Resend is not configured — set ${missing.join(' and ')} in .env`);
    this.name = 'NotConfiguredError';
  }
}

function missingSettings() {
  const missing = [];
  if (!config.mail.resendApiKey) missing.push('RESEND_API_KEY');
  if (!config.mail.from) missing.push('MAIL_FROM');
  return missing;
}

function renderHtml({ name, code, minutes }) {
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#080A09;font-family:'Barlow',Helvetica,Arial,sans-serif;color:#F1F5F2">
    <div style="max-width:420px;margin:0 auto;background:#121715;border:1px solid #222A26;border-radius:20px;padding:28px">
      <div style="font-size:24px;font-weight:800;letter-spacing:-0.03em;margin-bottom:4px">Watchsheet</div>
      <div style="font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#00E27A;margin-bottom:24px">Your season, logged</div>
      <p style="margin:0 0 12px;font-size:15px">${greeting}</p>
      <p style="margin:0 0 20px;font-size:15px;color:#8B9792">Here is your sign-in code.</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:0.28em;text-align:center;padding:18px;background:#0D110F;border:1px solid #222A26;border-radius:14px">${escapeHtml(code)}</div>
      <p style="margin:20px 0 0;font-size:13px;color:#8B9792">It expires in ${minutes} minutes. If you did not ask for it, you can ignore this email.</p>
    </div>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

export const resendProvider = {
  name: 'resend',

  get configured() {
    return missingSettings().length === 0;
  },

  async sendOtp({ to, name, code, expiresAt }) {
    const missing = missingSettings();
    if (missing.length) throw new NotConfiguredError(missing);

    const minutes = Math.max(1, Math.round((expiresAt - Date.now()) / 60000));
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.mail.resendApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: config.mail.from,
        to: [to],
        subject: `${code} is your Watchsheet code`,
        html: renderHtml({ name, code, minutes }),
        text: `Your Watchsheet sign-in code is ${code}. It expires in ${minutes} minutes.`,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend responded ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = await res.json().catch(() => ({}));
    return { delivered: true, provider: 'resend', id: json.id ?? null };
  },
};
