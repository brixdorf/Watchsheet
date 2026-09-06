import { config } from '../../config.js';
import { consoleProvider } from './console.js';
import { resendProvider } from './resend.js';

/**
 * Mail providers all implement one method:
 *
 *   sendOtp({ to, name, code, expiresAt }) -> { delivered, provider }
 *
 * Swapping delivery is therefore an env var (MAIL_PROVIDER), not a code change. Adding a
 * third provider means adding one file and one entry below.
 */

const PROVIDERS = {
  console: consoleProvider,
  resend: resendProvider,
};

export function mailProvider() {
  const chosen = PROVIDERS[config.mail.provider];
  if (!chosen) {
    console.warn(
      `Unknown MAIL_PROVIDER "${config.mail.provider}" — falling back to console delivery.`,
    );
    return consoleProvider;
  }
  if (!chosen.configured) {
    console.warn(
      `MAIL_PROVIDER is "${chosen.name}" but it is not configured — falling back to console delivery.`,
    );
    return consoleProvider;
  }
  return chosen;
}

/**
 * True when codes are only printed locally, which is what lets the verify screen echo the
 * code back in development. Never true once a real provider is delivering mail.
 */
export function isLocalDelivery() {
  return mailProvider().name === 'console';
}
