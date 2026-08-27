"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

let cliente: ReturnType<typeof createBrowserClient> | null = null;

/** Cliente do navegador — usado pelo painel para o Realtime. */
export function createClient() {
  if (!cliente) {
    cliente = createBrowserClient(supabaseUrl(), supabaseAnonKey());
  }
  return cliente;
}
