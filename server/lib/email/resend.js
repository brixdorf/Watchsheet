import { Resend } from 'resend';
import { config } from '../../config.js';
import { otpHtml, otpSubject, otpText } from './template.js';

/**
 * Resend provider: live outbound sending.
 *
 * Deployment shape this is written against: example.com stays on another mail host, which keeps the
 * apex MX records and receives mail, while Resend sends from the mail.example.com
 * subdomain. Resend's DKIM, SPF and bounce MX all live under that subdomain, so none of them
 * touch another mail host's records on the apex.
 *
 * Resend is used for sending only; its receiving side is deliberately not enabled. Replies
 * to a sign-in code are therefore pointed at the another mail host inbox with the reply-to header, which
 * config defaults to hi@example.com.
 *
 * Nothing here runs until RESEND_API_KEY is set (the sender has a default): `configured`
 * stays false and the factory falls back to console delivery rather than failing sign-in.
 */

export class NotConfiguredError extends Error {
  constructor(missing) {
    super(`Resend is not configured. Set ${missing.join(' and ')} in the environment.`);
    this.name = 'NotConfiguredError';
  }
}

// Built on first use, and rebuilt if the key changes, so importing this module is free.
let client = null;
let clientKey = '';
function clientFor(apiKey) {
  if (!client || clientKey !== apiKey) {
    client = new Resend(apiKey);
    clientKey = apiKey;
  }
  return client;
}

function missingSettings() {
  const missing = [];
  if (!config.mail.resendApiKey) missing.push('RESEND_API_KEY');
  if (!config.mail.from) missing.push('MAIL_FROM');
  return missing;
}

const isRateLimited = (error) =>
  /rate_limit/i.test(error?.name ?? '') || /rate limit/i.test(error?.message ?? '');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const resendProvider = {
  name: 'resend',

  get configured() {
    return missingSettings().length === 0;
  },

  /**
   * The SDK reports failures as a returned `error`, not a thrown one, so both shapes have to
   * be handled: a returned error becomes a throw for the caller, and a genuine network fault
   * propagates on its own. Either way the route answers 502 and the user is told to retry.
   */
  async sendOtp({ to, name, code, expiresAt, codeId }) {
    const missing = missingSettings();
    if (missing.length) throw new NotConfiguredError(missing);

    const minutes = Math.max(1, Math.round((expiresAt - Date.now()) / 60000));
    const message = {
      from: config.mail.from,
      to: [to],
      subject: otpSubject(code),
      html: otpHtml({ name, code, minutes, replyTo: config.mail.replyTo }),
      text: otpText({ name, code, minutes, replyTo: config.mail.replyTo }),
      tags: [{ name: 'category', value: 'signin_code' }],
    };
    if (config.mail.replyTo) message.replyTo = config.mail.replyTo;

    // One key per issued code, so the retry below cannot deliver a second copy. It belongs
    // in the send options rather than the message: the SDK whitelists the message fields it
    // forwards, and reads this one only from the second argument.
    const options = codeId ? { idempotencyKey: `signin-code/${codeId}` } : {};
    const send = () => clientFor(config.mail.resendApiKey).emails.send(message, options);

    let { data, error } = await send();
    // The account limit is 10 requests a second. A user who trips it would otherwise have to
    // sit out the 30s resend cooldown before trying again, so absorb it once here.
    if (error && isRateLimited(error)) {
      await wait(1000);
      ({ data, error } = await send());
    }

    if (error) {
      throw new Error(`Resend refused the message (${error.name}): ${error.message}`);
    }
    return { delivered: true, provider: 'resend', id: data?.id ?? null };
  },
};
