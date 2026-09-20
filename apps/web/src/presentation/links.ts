import type { AppLinks } from "@/application/ports";
import { API, ROUTES } from "./routes";

/** The addresses use cases hand out, built from the app's routes on its public origin. */
export class RouteLinks implements AppLinks {
  private readonly origin: string;

  constructor(appUrl: string) {
    this.origin = appUrl.replace(/\/+$/, "");
  }

  signIn(token: string, handle?: string, plan?: string) {
    return this.origin + API.signInLink(token, handle, plan);
  }

  lockscreen(wallId: string, key: string) {
    return ROUTES.lockscreen(wallId, key);
  }

  checkoutSucceeded() {
    return this.origin + ROUTES.settingsUpgraded;
  }

  paidAccountAdded() {
    return this.origin + ROUTES.settingsAccountAdded;
  }

  checkoutCancelled() {
    return this.origin + ROUTES.pricing;
  }

  billingReturn() {
    return this.origin + ROUTES.settings;
  }

  referral(handle: string) {
    return this.origin + ROUTES.referral(handle);
  }

  oauthCallback() {
    return this.origin + API.oauthCallback;
  }
}
