import Link from "next/link";
import { CalendarRange, Clock, LogOut, Settings, Utensils } from "lucide-react";
import { sair } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Painel — Boteco do Turde" };

const ABAS = [
  { href: "/admin", rotulo: "Agenda", Icone: CalendarRange },
  { href: "/admin/mesas", rotulo: "Mesas", Icone: Utensils },
  { href: "/admin/horarios", rotulo: "Horários", Icone: Clock },
  { href: "/admin/configuracoes", rotulo: "Ajustes", Icone: Settings },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A tela de login se vira sozinha, sem o cabeçalho do painel.
  if (!user) return <>{children}</>;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-linha bg-noite/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-extrabold leading-tight text-giz">
              Boteco do Turde
            </p>
            <p className="truncate text-xs text-giz-fraco">{user.email}</p>
          </div>
          <form action={sair}>
            <Button type="submit" variant="fantasma" size="sm" aria-label="Sair">
              <LogOut />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </form>
        </div>

        <nav className="mx-auto max-w-5xl px-2">
          <ul className="rolagem-x flex gap-1 pb-2">
            {ABAS.map(({ href, rotulo, Icone }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-giz-fraco transition-colors hover:bg-madeira-2 hover:text-brasa"
                >
                  <Icone className="size-4" />
                  {rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
