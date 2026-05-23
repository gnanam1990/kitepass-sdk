import { NextResponse } from "next/server";
import { getDashboardStatus } from "@/lib/status";

export async function GET() {
  return NextResponse.json(getDashboardStatus(), {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
