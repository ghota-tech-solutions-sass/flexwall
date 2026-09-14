import { RequestSignInLink, SignIn } from "@/application/use-cases/auth";
import { ApplyBillingEvent, OpenBillingPortal, StartCheckout } from "@/application/use-cases/billing";
import { ClaimHandle } from "@/application/use-cases/claim-handle";
import { ConnectAccount, RemoveConnection } from "@/application/use-cases/connections";
import { ListExplore, ReportWall } from "@/application/use-cases/explore";
import { GetLockscreen } from "@/application/use-cases/lockscreen";
import { ResolveWall } from "@/application/use-cases/resolve-wall";
import { GetOwnerWall, GetPublicWall, RotateLockscreenLink, SaveWall } from "@/application/use-cases/walls";
import { StripeGateway } from "@/infrastructure/billing/stripe-gateway";
import { optionalEnv } from "@/infrastructure/env";
import { ConsoleMailer, GmailMailer } from "@/infrastructure/mail/mailers";
import { db } from "@/infrastructure/persistence/db";
import { DbConnections, DbEventLog, DbHandles, DbSnapshots, DbUsers, DbValueCache, DbWalls } from "@/infrastructure/persistence/repositories";
import { AesSecretBox } from "@/infrastructure/security/secret-box";
import { HmacTokenService } from "@/infrastructure/security/tokens";
import { GuardedRuntime, RandomIds, SystemClock } from "@/infrastructure/system";
import { catalog } from "@/plugins/registry";

/**
 * The composition root: the one place that picks implementations for ports
 * and builds use cases. Routes ask for use cases from here and nothing else.
 * Built once per server process.
 */
function build() {
  const production = process.env.NODE_ENV === "production";
  const appUrl = optionalEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000").replace(/\/+$/, "");

  const store = db();
  const clock = new SystemClock();
  const ids = new RandomIds();
  const users = new DbUsers(store);
  const handles = new DbHandles(store);
  const walls = new DbWalls(store);
  const connections = new DbConnections(store);
  const cache = new DbValueCache(store);
  const snapshots = new DbSnapshots(store);
  const events = new DbEventLog(store);
  const tokens = new HmacTokenService(optionalEnv("FLEXWALL_SECRET") || undefined, production, clock);
  const secrets = new AesSecretBox(optionalEnv("FLEXWALL_ENCRYPTION_KEY") || undefined, production);
  const mailbox = optionalEnv("EMAIL_IMPERSONATE");
  const mailer = mailbox ? new GmailMailer(mailbox, optionalEnv("EMAIL_FROM") || undefined) : new ConsoleMailer();
  const payments = new StripeGateway({
    secretKey: optionalEnv("STRIPE_SECRET_KEY") || undefined,
    webhookSecret: optionalEnv("STRIPE_WEBHOOK_SECRET") || undefined,
    prices: {
      monthly: optionalEnv("STRIPE_PRICE_MONTHLY") || null,
      yearly: optionalEnv("STRIPE_PRICE_YEARLY") || null,
      lifetime: optionalEnv("STRIPE_PRICE_LIFETIME") || null,
    },
    portalConfiguration: optionalEnv("STRIPE_PORTAL_CONFIGURATION") || null,
    checkout: {
      automaticTax: optionalEnv("STRIPE_AUTOMATIC_TAX") === "true",
      collectTermsConsent: optionalEnv("STRIPE_COLLECT_TERMS_CONSENT") === "true",
    },
  });
  const runtime = new GuardedRuntime(["GITHUB_TOKEN", "YOUTUBE_API_KEY"]);

  const resolveWall = new ResolveWall({ catalog, connections, cache, snapshots, secrets, runtime, clock });

  return {
    catalog,
    tokens,
    appUrl,
    mailerIsConsole: !mailbox,
    requestSignInLink: new RequestSignInLink({ tokens, mailer, appUrl }),
    signIn: new SignIn({ tokens, users, ids, clock }),
    claimHandle: new ClaimHandle({ users, handles, walls, ids, clock }),
    getOwnerWall: new GetOwnerWall({ users, walls, connections, tokens, clock }),
    saveWall: new SaveWall({ users, walls, connections, catalog, clock }),
    rotateLockscreenLink: new RotateLockscreenLink({ walls, ids, tokens, clock }),
    getPublicWall: new GetPublicWall({ walls, users, clock }),
    connectAccount: new ConnectAccount({ users, connections, catalog, runtime, secrets, ids, clock }),
    removeConnection: new RemoveConnection({ connections }),
    resolveWall,
    getLockscreen: new GetLockscreen({ walls, users, tokens }),
    listExplore: new ListExplore({ walls, users, resolve: resolveWall, catalog, clock }),
    reportWall: new ReportWall({ walls, mailer, moderationInbox: optionalEnv("MODERATION_INBOX", "report@flexwall.lol") }),
    startCheckout: new StartCheckout({ users, payments, clock, appUrl }),
    openBillingPortal: new OpenBillingPortal({ users, payments, appUrl }),
    applyBillingEvent: new ApplyBillingEvent({ users, events }),
    payments,
    users,
  };
}

export type Container = ReturnType<typeof build>;

const g = globalThis as unknown as { __flexwallContainer?: Container };

/** One container per process, shared by every route bundle. */
export function container(): Container {
  return (g.__flexwallContainer ??= build());
}
