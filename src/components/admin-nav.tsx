import Link from "next/link";

const links = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/salespeople", label: "Salespeople" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/sync", label: "Sync" },
];

/** Links between the admin pages. */
export function AdminNav() {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Admin">
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className="rounded-full border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
