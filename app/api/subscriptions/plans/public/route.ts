import { NextRequest, NextResponse } from "next/server";
import { listPublicPlans } from "@/lib/db/queries/subscriptions";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const audience = searchParams.get("audience");
    const normalizedAudience = audience === 'mentor' || audience === 'mentee' ? audience : undefined;
    const data = await listPublicPlans(normalizedAudience);

    if (data.length === 0) {
      const fallbackData = await listPublicPlans(normalizedAudience, true);
      return NextResponse.json({ success: true, data: fallbackData || [] });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error("Failed to fetch public plans:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch plans" },
      { status: 500 }
    );
  }
}
