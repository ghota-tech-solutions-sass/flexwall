import { invalid } from "@/domain/errors";
import { Handle } from "@/domain/handle";
import { canRefer, newReferral } from "@/domain/referral";
import { newUser, type User } from "@/domain/user";
import { isTimeZone } from "@/domain/time";
import type { Clock, HandleRegistry, IdGenerator, Mailer, ReferralRepository, TokenService, UserRepository } from "../ports";

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
    private readonly deps: {
      tokens: TokenService;
      users: UserRepository;
      handles: HandleRegistry;
      referrals: ReferralRepository;
      ids: IdGenerator;
      clock: Clock;
    }
  ) {}

  /** `referralHandle` is the handle from the invite link the browser followed, if any; only a new account uses it. */
  async execute(input: { token: string; timeZone?: string; referralHandle?: string }): Promise<{ user: User; session: string; isNew: boolean }> {
    const email = this.deps.tokens.verifyMagic(input.token);
    if (!email) throw invalid("This sign-in link has expired or was already replaced. Ask for a new one.");
    let user = await this.deps.users.byEmail(email);
    const isNew = !user;
    if (!user) {
      const now = this.deps.clock.now();
      const timeZone = input.timeZone && isTimeZone(input.timeZone) ? input.timeZone : "UTC";
      user = newUser({ id: this.deps.ids.next(), email, now, timeZone });
      const referrer = await this.referrerFor(input.referralHandle, user);
      if (referrer) user = { ...user, referredBy: referrer.id };
      await this.deps.users.save(user);
      if (referrer) await this.deps.referrals.save(newReferral({ referrerId: referrer.id, refereeId: user.id, now }));
    }
    return { user, session: this.deps.tokens.session(user.id), isNew };
  }

  /** Unknown handles and self-invitations are ignored: the account is created either way. */
  private async referrerFor(handle: string | undefined, referee: User): Promise<User | null> {
    if (!handle || !Handle.isValid(handle)) return null;
    const referrerId = await this.deps.handles.ownerOf(Handle.parse(handle));
    const referrer = referrerId ? await this.deps.users.byId(referrerId) : null;
    return referrer && canRefer(referrer, referee) ? referrer : null;
  }
}
