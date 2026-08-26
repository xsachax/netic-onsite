"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Game" },
  { href: "/evals", label: "Evaluations" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="Application">
      <Link className="brand-mark" href="/">
        C4<span>.</span>
      </Link>
      <div>
        {links.map((link) => (
          <Link
            aria-current={pathname === link.href ? "page" : undefined}
            className={pathname === link.href ? "active" : ""}
            href={link.href}
            key={link.href}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <a
        className="nav-source"
        href="https://github.com/xsachax/netic-onsite"
      >
        Source
      </a>
    </nav>
  );
}
