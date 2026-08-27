import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * A opção `cookies` do @supabase/ssr é uma união de formatos (o novo
 * getAll/setAll e o antigo get/set/remove), então o TypeScript não infere
 * sozinho o tipo do parâmetro. Declaramos explicitamente.
 */
type CookiesParaGravar = {
  name: string;
  value: string;
  options: CookieOptions;
}[];

/** Cliente com a sessão da equipe do bar (lê e grava cookies). */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookiesParaGravar) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Chamado de um Server Component: o middleware já renova a sessão.
        }
      },
    },
  });
}

/**
 * Cliente anônimo, sem cookies. Usado no fluxo público de reserva, que
 * conversa só com as funções SECURITY DEFINER do banco.
 */
export function createPublicClient() {
  return createSupabaseClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
