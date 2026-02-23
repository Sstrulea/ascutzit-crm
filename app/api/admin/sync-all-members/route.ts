import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * Sincronizează TOȚI membrii din app_members cu auth.users
 * Repară user_id-uri invalide automat
 */
export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    if (!supabaseServiceKey) {
      return NextResponse.json({
        ok: false,
        error: 'SUPABASE_SERVICE_ROLE_KEY lipsește din .env.local'
      }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Obține toți utilizatorii din auth.users
    const { data: authUsers } = await supabase.auth.admin.listUsers()
    
    // 2. Obține toți membrii din app_members
    const { data: appMembers, error: membersError } = await supabase
      .from('app_members')
      .select('*')
    
    if (membersError) throw membersError

    let synced = 0
    let deleted = 0
    const results = []

    // 3. Pentru fiecare membru din app_members
    for (const member of appMembers || []) {
      // Verifică dacă user_id-ul există în auth.users
      const authUser = authUsers.users.find(u => u.id === member.user_id)
      
      if (!authUser) {
        // User_id invalid - încearcă să găsești utilizatorul după email
        const authUserByEmail = authUsers.users.find(u => u.email === member.email)
        
        if (authUserByEmail) {
          // Găsit în auth.users după email - actualizează user_id
          const { error } = await supabase
            .from('app_members')
            .update({ user_id: authUserByEmail.id })
            .eq('email', member.email)
          
          if (!error) {
            synced++
            results.push({
              email: member.email,
              status: 'synced',
              old_user_id: member.user_id,
              new_user_id: authUserByEmail.id
            })
          }
        } else {
          // Nu există în auth.users - șterge din app_members
          await supabase
            .from('app_members')
            .delete()
            .eq('user_id', member.user_id)
          
          deleted++
          results.push({
            email: member.email,
            status: 'deleted',
            reason: 'Nu există în auth.users'
          })
        }
      } else {
        // User_id valid - nimic de făcut
        results.push({
          email: member.email,
          status: 'ok',
          user_id: member.user_id
        })
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Sincronizare completă: ${synced} sincronizați, ${deleted} șterși`,
      synced,
      deleted,
      results
    })

  } catch (error: any) {
    console.error('Sync all error:', error)
    return NextResponse.json({
      ok: false,
      error: error.message || 'Eroare la sincronizare'
    }, { status: 500 })
  }
}



