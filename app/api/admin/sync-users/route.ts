import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * API simplificat pentru sincronizarea user_id-urilor
 * NU necesită SQL manual!
 */
export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    if (!supabaseServiceKey) {
      return NextResponse.json({
        ok: false,
        error: 'Adaugă SUPABASE_SERVICE_ROLE_KEY în .env.local (găsești în Supabase Dashboard → Settings → API)'
      }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { userEmail, pipelineNames } = await request.json()

    // 1. Găsește user_id real din auth.users
    const { data: authUsers } = await supabase.auth.admin.listUsers()
    const authUser = authUsers.users.find(u => u.email === userEmail)

    if (!authUser) {
      return NextResponse.json({
        ok: false,
        error: `Utilizatorul cu email ${userEmail} nu există în auth.users. Creează-l mai întâi în Authentication.`
      })
    }

    // 2. Șterge intrările vechi cu user_id invalid
    await supabase
      .from('app_members')
      .delete()
      .eq('email', userEmail)
      .neq('user_id', authUser.id)

    // 3. Creează/actualizează intrarea corectă
    const { error: upsertError } = await supabase
      .from('app_members')
      .upsert({
        user_id: authUser.id,
        name: 'Ghiorghe Cepoi',
        email: userEmail,
        role: 'member'
      }, { onConflict: 'user_id' })

    if (upsertError) throw upsertError

    // 4. Acordă permisiuni pentru pipeline-uri
    if (pipelineNames && pipelineNames.length > 0) {
      // Găsește pipeline-urile
      const { data: pipelinesData, error: pipelinesError } = await supabase
        .from('pipelines')
        .select('id, name')
        .in('name', pipelineNames)

      if (pipelinesError) throw pipelinesError

      if (pipelinesData && pipelinesData.length > 0) {
        // Șterge permisiunile vechi
        await supabase
          .from('user_pipeline_permissions')
          .delete()
          .eq('user_id', authUser.id)

        // Adaugă permisiunile noi
        const permissions = pipelinesData.map(p => ({
          user_id: authUser.id,
          pipeline_id: p.id
        }))

        const { error: permError } = await supabase
          .from('user_pipeline_permissions')
          .insert(permissions)

        if (permError) throw permError
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'User sincronizat și permisiuni acordate!',
      user_id: authUser.id
    })

  } catch (error: any) {
    console.error('Sync error:', error)
    return NextResponse.json({
      ok: false,
      error: error.message || 'Eroare la sincronizare'
    }, { status: 500 })
  }
}



