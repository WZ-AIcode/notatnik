import { prisma } from "@/lib/prisma";

export const FREE_DAILY_TOKENS = 10_000;
export const PREMIUM_DAILY_TOKENS = 100_000;

export function getDailyLimit(plan: string): number {
  return plan === "premium" ? PREMIUM_DAILY_TOKENS : FREE_DAILY_TOKENS;
}

function isNewDay(lastReset: Date): boolean {
  const now = new Date();
  return (
    now.getUTCFullYear() !== lastReset.getUTCFullYear() ||
    now.getUTCMonth() !== lastReset.getUTCMonth() ||
    now.getUTCDate() !== lastReset.getUTCDate()
  );
}

/**
 * Checks whether the user's daily token counter should be reset (new calendar day in UTC).
 * If so, resets tokensUsed to 0 and updates tokensLastReset. Returns the current
 * (possibly just-reset) tokensUsed and plan.
 */
export async function checkAndRenewTokens(
  userId: string,
): Promise<{ tokensUsed: number; plan: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, tokensUsed: true, tokensLastReset: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (isNewDay(user.tokensLastReset)) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        tokensUsed: 0,
        tokensLastReset: new Date(),
      },
    });
    return { tokensUsed: 0, plan: user.plan };
  }

  return { tokensUsed: user.tokensUsed, plan: user.plan };
}

/**
 * Returns how many tokens the user has left for today.
 * Triggers daily renewal if a new calendar day has started.
 */
export async function getRemainingTokens(userId: string): Promise<number> {
  const { tokensUsed, plan } = await checkAndRenewTokens(userId);
  return getDailyLimit(plan) - tokensUsed;
}

/**
 * Attempts to consume `amount` tokens for a user.
 * Triggers daily renewal if needed.
 * Returns true if the tokens were consumed, false if the daily limit would be exceeded.
 *
 * The limit check and counter increment are performed in a single atomic SQL statement
 * to prevent race conditions under concurrent requests.
 */
export async function consumeTokens(
  userId: string,
  amount: number,
): Promise<boolean> {
  const { plan } = await checkAndRenewTokens(userId);
  const limit = getDailyLimit(plan);

  // Atomically increment only when the updated value would not exceed the limit.
  const affected = await prisma.$executeRaw`
    UPDATE "User"
    SET "tokensUsed" = "tokensUsed" + ${amount}
    WHERE id = ${userId}
      AND "tokensUsed" + ${amount} <= ${limit}
  `;

  return affected > 0;
}
