import { RequestSignInLink, SignIn } from "@/application/use-cases/auth";
import { ApplyBillingEvent, OpenBillingPortal, StartCheckout, StartCreditsCheckout } from "@/application/use-cases/billing";
import { ConnectorAccess, GetConnectorControls, ListPublicConnectors, SetConnectorAvailability } from "@/application/use-cases/connector-policy";
import { GetCredits } from "@/application/use-cases/credits";
import { AdjustCredits, GetAccount, IsAdministrator, ListAccounts, ModerateWall, OfferPro, WithdrawPro } from "@/application/use-cases/admin";
import { ClaimHandle } from "@/application/use-cases/claim-handle";
import { ConnectAccount, FinishConnectionSignIn, RemoveConnection, RenameConnection, StartConnectionSignIn } from "@/application/use-cases/connections";
import { ListExplore, ReportWall } from "@/application/use-cases/explore";
import { GetLockscreen } from "@/application/use-cases/lockscreen";
import { ResolveWall } from "@/application/use-cases/resolve-wall";
import { GetReferralProgram } from "@/application/use-cases/referrals";
import { GetOwnerWall, GetPublicWall, RotateLockscreenLink, SaveWall } from "@/application/use-cases/walls";
import { StripeGateway } from "@/infrastructure/billing/stripe-gateway";
import { isProduction, optionalEnv } from "@/infrastructure/env";
import { ConsoleMailer, GmailMailer } from "@/infrastructure/mail/mailers";
import { db } from "@/infrastructure/persistence/db";
import { parseAdministrators } from "@/domain/admin";
import { DbConnections, DbConnectorPolicies, DbCredits, DbEventLog, DbHandles, DbReferrals, DbSnapshots, DbUsers, DbValueCache, DbWalls } from "@/infrastructure/persistence/repositories";
import { AesSecretBox } from "@/infrastructure/security/secret-box";
import { HmacTokenService } from "@/infrastructure/security/tokens";
import { GuardedRuntime, RandomIds, SystemClock } from "@/infrastructure/system";
import { catalog } from "@/plugins/registry";
import { RouteLinks } from "@/presentation/links";
import { LOCAL_APP_URL } from "@/site";

/**
 * Server configuration plugins may read: keys and app credentials that belong
 * to this Flexwall server, never the Stripe secret or the encryption key.
 * Each one is documented in docs/self-hosting.md.
 */
const CONNECTOR_ENV = [
  "GITHUB_TOKEN",
  "YOUTUBE_API_KEY",
  "STEAM_API_KEY",
  "TWITCH_CLIENT_ID",
  "TWITCH_CLIENT_SECRET",
  "TIKTOK_CLIENT_KEY",
  "TIKTOK_CLIENT_SECRET",
  "INSTAGRAM_APP_ID",
  "INSTAGRAM_APP_SECRET",
  "ENABLE_BANKING_APP_ID",
  "ENABLE_BANKING_PRIVATE_KEY",
  "SNAPTRADE_CLIENT_ID",
  "SNAPTRADE_CONSUMER_KEY",
  "PLAID_CLIENT_ID",
  "PLAID_SECRET",
  "PLAID_ENV",
  "SNAPTRADE_ENV",
  "ENABLE_BANKING_ENV",
  "TIKTOK_ENV",
  "INSTAGRAM_ENV",
  "POWENS_DOMAIN",
  "POWENS_CLIENT_ID",
  "POWENS_CLIENT_SECRET",
  "POWENS_ENV",
  "X_BEARER_TOKEN",
] as const;

/** Where wall reports go when MODERATION_INBOX isn't set. */
const DEFAULT_MODERATION_INBOX = "report@flexwall.lol";

/**
 * The composition root: the one place that picks implementations for ports
 * and builds use cases. Routes ask for use cases from here and nothing else.
 * Built once per server process.
 */
function build() {
  const production = isProduction();
  const appUrl = optionalEnv("NEXT_PUBLIC_APP_URL", LOCAL_APP_URL).replace(/\/+$/, "");
  const links = new RouteLinks(appUrl);

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
  const referrals = new DbReferrals(store);
  const credits = new DbCredits(store);
  const connectorPolicies = new DbConnectorPolicies(store);
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
      credits: {
        starter: optionalEnv("STRIPE_PRICE_CREDITS_STARTER") || null,
        regular: optionalEnv("STRIPE_PRICE_CREDITS_REGULAR") || null,
      },
    },
    portalConfiguration: optionalEnv("STRIPE_PORTAL_CONFIGURATION") || null,
    checkout: {
      automaticTax: optionalEnv("STRIPE_AUTOMATIC_TAX") === "true",
      collectTermsConsent: optionalEnv("STRIPE_COLLECT_TERMS_CONSENT") === "true",
      referralCoupon: optionalEnv("STRIPE_REFERRAL_COUPON") || null,
    },
  });
  const runtime = new GuardedRuntime(CONNECTOR_ENV);

  const administrators = parseAdministrators(optionalEnv("ADMIN_EMAILS"));
  const access = new ConnectorAccess({ catalog, policies: connectorPolicies, runtime, clock });
  const admin = { users, walls, connections, clock, administrators };
  const connectorAdmin = { users, connections, policies: connectorPolicies, access, catalog, clock, administrators };

  const resolveWall = new ResolveWall({ catalog, connections, cache, snapshots, secrets, runtime, credits, access, administrators, clock });

  return {
    catalog,
    tokens,
    appUrl,
    mailerIsConsole: !mailbox,
    requestSignInLink: new RequestSignInLink({ tokens, mailer, links }),
    signIn: new SignIn({ tokens, users, handles, referrals, ids, clock }),
    claimHandle: new ClaimHandle({ users, handles, walls, ids, clock }),
    getOwnerWall: new GetOwnerWall({ users, walls, connections, tokens, links, clock, access, administrators }),
    saveWall: new SaveWall({ users, walls, connections, catalog, clock }),
    rotateLockscreenLink: new RotateLockscreenLink({ walls, ids, tokens, links, clock }),
    getPublicWall: new GetPublicWall({ walls, users, clock }),
    connectAccount: new ConnectAccount({ users, connections, catalog, runtime, secrets, ids, clock, access, administrators }),
    startConnectionSignIn: new StartConnectionSignIn({ users, connections, catalog, runtime, secrets, ids, clock, links, access, administrators }),
    finishConnectionSignIn: new FinishConnectionSignIn({ users, connections, catalog, runtime, secrets, ids, clock, links, access, administrators }),
    removeConnection: new RemoveConnection({ connections, catalog, secrets, runtime, clock }),
    renameConnection: new RenameConnection({ connections }),
    resolveWall,
    getLockscreen: new GetLockscreen({ walls, users, tokens }),
    listExplore: new ListExplore({ walls, users, resolve: resolveWall, catalog, clock }),
    reportWall: new ReportWall({ walls, mailer, moderationInbox: optionalEnv("MODERATION_INBOX", DEFAULT_MODERATION_INBOX) }),
    startCheckout: new StartCheckout({ users, referrals, payments, clock, links }),
    openBillingPortal: new OpenBillingPortal({ users, payments, links }),
    applyBillingEvent: new ApplyBillingEvent({ users, events, referrals, credits, clock }),
    startCreditsCheckout: new StartCreditsCheckout({ users, payments, clock, links }),
    getCredits: new GetCredits({ credits, connections, catalog }),
    getReferralProgram: new GetReferralProgram({ users, referrals, clock, links }),
    isAdministrator: new IsAdministrator(admin),
    listAccounts: new ListAccounts(admin),
    getAccount: new GetAccount(admin),
    offerPro: new OfferPro(admin),
    withdrawPro: new WithdrawPro(admin),
    adjustCredits: new AdjustCredits({ ...admin, credits, ids }),
    publicConnectors: new ListPublicConnectors({ access }),
    getConnectorControls: new GetConnectorControls(connectorAdmin),
    setConnectorAvailability: new SetConnectorAvailability(connectorAdmin),
    moderateWall: new ModerateWall(admin),
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
