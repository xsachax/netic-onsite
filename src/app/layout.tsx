import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Connect Four Agent",
  description:
    "Play Connect Four against a tool-using hybrid LLM and search agent.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
