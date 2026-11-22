import Link from "next/link";
import { Logo } from "../components/Logo";
import { RequestedNotFoundPath } from "./requested-not-found-path";

const recoveryLinks = [
  {
    href: "/dashboard",
    label: "Back to dashboard",
    description: "Return to your latest runs and campaign health.",
    primary: true,
  },
  {
    href: "/runs",
    label: "Open runs",
    description: "Browse every fuzzing campaign in the workspace.",
    primary: false,
  },
  {
    href: "/search",
    label: "Search CrashLab",
    description: "Find runs, artifacts, crashes, and settings.",
    primary: false,
  },
  {
    href: "/start",
    label: "Start a new run",
    description: "Use the guided setup to launch another campaign.",
    primary: false,
  },
] as const;

export default function NotFound() {
  return (
    <section
      className="flex min-h-[calc(100vh-56px)] items-center justify-center px-5 py-16 sm:px-8 lg:min-h-[calc(100vh-68px)]"
      style={{ backgroundColor: "var(--bg)", color: "var(--text-primary)" }}
    >
      <div className="w-full max-w-2xl text-center">
        <div className="mb-8 flex justify-center">
          <Logo size={52} />
        </div>

        <p
          className="mb-3 font-mono text-xs font-bold tracking-[0.2em] uppercase"
          style={{ color: "var(--text-secondary)" }}
        >
          Error 404
        </p>
        <h1
          className="text-3xl font-extrabold tracking-tight sm:text-5xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          This route slipped past the fuzzer
        </h1>
        <p
          className="mx-auto mt-5 max-w-xl text-sm leading-6 sm:text-base"
          style={{ color: "var(--text-secondary)" }}
        >
          The page may have moved, or the address may be incomplete. Use one of the recovery paths below to get back into CrashLab.
        </p>

        <RequestedNotFoundPath />

        <nav className="mt-8 grid gap-3 text-left sm:grid-cols-2" aria-label="Page recovery options">
          {recoveryLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              prefetch
              className="group min-h-24 rounded-xl border px-5 py-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2"
              style={
                link.primary
                  ? {
                      borderColor: "var(--text-primary)",
                      backgroundColor: "var(--text-primary)",
                      color: "var(--bg)",
                    }
                  : {
                      borderColor: "var(--border-color)",
                      backgroundColor: "var(--surface)",
                      color: "var(--text-primary)",
                    }
              }
            >
              <span className="block text-sm font-bold">{link.label}</span>
              <span
                className="mt-1 block text-xs font-normal leading-5"
                style={{ color: link.primary ? "inherit" : "var(--text-secondary)" }}
              >
                {link.description}
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}
