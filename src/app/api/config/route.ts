import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db";

export const runtime = "nodejs";

export function GET(): NextResponse {
  const defaultProvider =
    process.env.AGENT_PROVIDER === "anthropic" ? "anthropic" : "openai";

  return NextResponse.json({
    providers: {
      openai: {
        available: Boolean(process.env.OPENAI_API_KEY),
        model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
      },
      anthropic: {
        available: Boolean(process.env.ANTHROPIC_API_KEY),
        model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
      },
    },
    defaultProvider,
    persistence: {
      available: isDatabaseConfigured(),
    },
  });
}
