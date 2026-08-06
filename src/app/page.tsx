import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export default async function RootPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: contexts } = await supabase
    .from('contexts')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)

  if (contexts && contexts.length > 0) {
    redirect('/queue')
  } else {
    redirect('/submit')
  }
}
