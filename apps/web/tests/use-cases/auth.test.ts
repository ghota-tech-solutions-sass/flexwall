import { describe, expect, test } from "bun:test";
import { RequestSignInLink, SignIn } from "@/application/use-cases/auth";
import { aUser } from "../builders";
import { FakeLinks, FakeTokens, FixedClock, InMemoryHandles, InMemoryReferrals, InMemoryUsers, RecordingMailer, SequentialIds } from "../fakes";

describe("RequestSignInLink", () => {
  test("given an email address, when a link is requested, then a sign-in link is mailed to it", async () => {
    // Given
    const mailer = new RecordingMailer();
    const requestLink = new RequestSignInLink({ tokens: new FakeTokens(), mailer, links: new FakeLinks() });

    // When
    await requestLink.execute({ email: "  Ada@Example.com " });

    // Then
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe("ada@example.com");
    expect(mailer.sent[0].text).toContain("https://flexwall.test/api/auth/verify?token=magic%3Aada%40example.com");
  });

  test("given something that isn't an email, when a link is requested, then nothing is sent", async () => {
    // Given
    const mailer = new RecordingMailer();
    const requestLink = new RequestSignInLink({ tokens: new FakeTokens(), mailer, links: new FakeLinks() });

    // When
    const attempt = requestLink.execute({ email: "ada" });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "invalid_input" });
    expect(mailer.sent).toHaveLength(0);
  });
});

describe("SignIn", () => {
  function setup() {
    const users = new InMemoryUsers();
    return { users, signIn: new SignIn({ tokens: new FakeTokens(), users, handles: new InMemoryHandles(), referrals: new InMemoryReferrals(), ids: new SequentialIds(), clock: new FixedClock() }) };
  }

  test("given a first-time email, when its link is opened, then an account is created in the browser's time zone", async () => {
    // Given
    const { users, signIn } = setup();

    // When
    const { user, session, isNew } = await signIn.execute({ token: "magic:ada@example.com", timeZone: "Asia/Tokyo" });

    // Then
    expect(isNew).toBe(true);
    expect(user.handle).toBeNull();
    expect(user.timeZone).toBe("Asia/Tokyo");
    expect(session).toBe(`session:${user.id}`);
    expect(users.items.size).toBe(1);
  });

  test("given an existing account, when its link is opened, then the same account signs in", async () => {
    // Given
    const { users, signIn } = setup();
    await users.save(aUser().withId("u1").withEmail("ada@example.com").build());

    // When
    const { user, isNew } = await signIn.execute({ token: "magic:ada@example.com" });

    // Then
    expect(isNew).toBe(false);
    expect(user.id).toBe("u1");
    expect(users.items.size).toBe(1);
  });

  test("given an expired or forged link, when it's opened, then no session is issued", async () => {
    // Given
    const { signIn } = setup();

    // When
    const attempt = signIn.execute({ token: "garbage" });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "invalid_input" });
  });
});
