import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        )
      },
    },
  })
}

export function createServiceSupabaseClient() {
  return createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? supabaseAnonKey
  )
}
