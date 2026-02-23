import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * API Route pentru configurarea automată a permisiunilor
 * Rulează toate migration-urile SQL fără să accesezi Supabase Dashboard
 */
export async function POST(request: Request) {
  try {
    // Creează client Supabase cu service role (pentru a bypassa RLS)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    if (!supabaseServiceKey) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY lipsește din .env.local' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    })

    // IMPORTANT: RLS trebuie setat manual în Supabase Dashboard:
    // ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;
    // ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
    // ALTER TABLE conversation_participants DISABLE ROW LEVEL SECURITY;
    // ALTER TABLE app_members DISABLE ROW LEVEL SECURITY;

    const { userEmail } = await request.json()
    
    if (userEmail) {
      // Găsește user_id din auth.users
      const { data: authUsers } = await supabase.auth.admin.listUsers()
      const authUser = authUsers.users.find(u => u.email === userEmail)

      if (!authUser) {
        return NextResponse.json({ 
          ok: false, 
          error: `Utilizatorul cu email ${userEmail} nu există în auth.users` 
        })
      }

      // Șterge intrarea veche din app_members
      await supabase
        .from('app_members')
        .delete()
        .eq('email', userEmail)
        .neq('user_id', authUser.id)

      // Creează/actualizează intrarea corectă
      await supabase
        .from('app_members')
        .upsert({
          user_id: authUser.id,
          name: 'Ghiorghe Cepoi',
          email: userEmail,
          role: 'member'
        })

      // Obține pipeline-urile necesare
      const { data: pipelinesData } = await supabase
        .from('pipelines')
        .select('id, name')
        .in('name', ['Saloane', 'Frizerii', 'Horeca', 'Reparatii'])

      // Acordă permisiuni
      if (pipelinesData) {
        const permissions = pipelinesData.map(p => ({
          user_id: authUser.id,
          pipeline_id: p.id
        }))

        await supabase
          .from('user_pipeline_permissions')
          .upsert(permissions, { onConflict: 'user_id,pipeline_id' })
      }
    }

    return NextResponse.json({ 
      ok: true, 
      message: 'Setup completat cu succes!' 
    })

  } catch (error: any) {
    console.error('Setup error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error.message || 'Eroare la setup' 
    }, { status: 500 })
  }
}



