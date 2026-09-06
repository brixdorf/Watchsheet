/**
 * Development mail provider: prints the code to the server output instead of sending it.
 *
 * This is what makes the OTP flow genuinely usable before a real provider is wired — the
 * code is real, hashed and verified like any other; only delivery is local.
 */

const WIDTH = 46;
const line = (text = '') => `  │ ${String(text).padEnd(WIDTH)}│`;

export const consoleProvider = {
  name: 'console',
  configured: true,

  async sendOtp({ to, name, code, expiresAt }) {
    const mins = Math.max(1, Math.round((expiresAt - Date.now()) / 60000));
    console.log(
      [
        '',
        `  ┌${'─'.repeat(WIDTH + 1)}┐`,
        line(`Watchsheet sign-in code${name ? ` for ${name}` : ''}`),
        line(to),
        line(),
        line(`    ${code.split('').join(' ')}`),
        line(),
        line(`expires in ${mins} minute${mins === 1 ? '' : 's'}`),
        `  └${'─'.repeat(WIDTH + 1)}┘`,
        '',
      ].join('\n'),
    );
    return { delivered: false, provider: 'console' };
  },
};
