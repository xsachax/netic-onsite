import { NextResponse } from "next/server";
import { DatabaseUnavailableError, getGameAnalytics } from "@/db";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await getGameAnalytics());
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      return NextResponse.json(
        {
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: error.message,
          },
        },
        { status: 503 },
      );
    }
    throw error;
  }
}
