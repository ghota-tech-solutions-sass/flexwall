import { summarize, type ReferralSummary } from "@/domain/referral";
import type { Clock, ReferralRepository, UserRepository } from "../ports";

export interface ReferralProgram {
  /** The user's invite link; null until they have a handle. */
  link: string | null;
  summary: ReferralSummary;
  /** Who invited this user, while their invitee discount still applies. */
  invitedBy: string | null;
}

/** What settings and pricing show about referrals for one user. */
export class GetReferralProgram {
  constructor(private readonly deps: { users: UserRepository; referrals: ReferralRepository; clock: Clock; appUrl: string }) {}

  async execute(input: { userId: string }): Promise<ReferralProgram | null> {
    const user = await this.deps.users.byId(input.userId);
    if (!user) return null;
    const [mine, own] = await Promise.all([this.deps.referrals.byReferrer(user.id), this.deps.referrals.byReferee(user.id)]);
    const inviter = own?.status === "signed_up" ? await this.deps.users.byId(own.referrerId) : null;
    return {
      link: user.handle ? `${this.deps.appUrl}/r/${user.handle}` : null,
      summary: summarize(mine, user, this.deps.clock.now()),
      invitedBy: inviter?.handle ?? null,
    };
  }
}
