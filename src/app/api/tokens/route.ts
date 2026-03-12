import { NextResponse } from "next/server";

import { getAuthSession } from "@/auth";
import { checkAndRenewTokens, getDailyLimit } from "@/lib/tokens";

export async function GET() {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tokensUsed, plan } = await checkAndRenewTokens(session.user.id);
  const dailyLimit = getDailyLimit(plan);
  const tokensRemaining = dailyLimit - tokensUsed;

  return NextResponse.json({
    plan,
    tokensUsed,
    tokensRemaining,
    dailyLimit,
  });
}
