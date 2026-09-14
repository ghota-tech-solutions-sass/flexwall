import { invalid } from "@/domain/errors";
import { newUser, type User } from "@/domain/user";
import { isTimeZone } from "@/domain/time";
import type { Clock, IdGenerator, Mailer, TokenService, UserRepository } from "../ports";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

/** Emails a sign-in link. Same answer whether or not the address has an account. */
export class RequestSignInLink {
  constructor(
    private readonly deps: { tokens: TokenService; mailer: Mailer; appUrl: string }
  ) {}

  async execute(input: { email: string }): Promise<{ link: string }> {
    const email = input.email.trim().toLowerCase();
    if (!EMAIL.test(email)) throw invalid("That doesn't look like an email address.");
    const link = `${this.deps.appUrl}/api/auth/verify?token=${encodeURIComponent(this.deps.tokens.magic(email))}`;
    await this.deps.mailer.send({
      to: email,
      subject: "Your Flexwall sign-in link",
      text: `Sign in to Flexwall:\n\n${link}\n\nThe link works for 20 minutes. If you didn't ask for it, ignore this email.`,
      html: `<p>Sign in to Flexwall:</p><p><a href="${link}">Sign in</a></p><p style="color:#777">The link works for 20 minutes. If you didn't ask for it, ignore this email.</p>`,
    });
    return { link };
  }
}

/** Exchanges a sign-in link for a session, creating the account on first use. */
export class SignIn {
  constructor(
    private readonly deps: { tokens: TokenService; users: UserRepository; ids: IdGenerator; clock: Clock }
  ) {}

  async execute(input: { token: string; timeZone?: string }): Promise<{ user: User; session: string; isNew: boolean }> {
    const email = this.deps.tokens.verifyMagic(input.token);
    if (!email) throw invalid("This sign-in link has expired or was already replaced. Ask for a new one.");
    let user = await this.deps.users.byEmail(email);
    const isNew = !user;
    if (!user) {
      const timeZone = input.timeZone && isTimeZone(input.timeZone) ? input.timeZone : "UTC";
      user = newUser({ id: this.deps.ids.next(), email, now: this.deps.clock.now(), timeZone });
      await this.deps.users.save(user);
    }
    return { user, session: this.deps.tokens.session(user.id), isNew };
  }
}
