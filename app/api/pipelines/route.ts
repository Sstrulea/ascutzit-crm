import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { invalidateStageIdsCache } from "@/lib/supabase/tehnicianDashboardStageIdsCache"

export async function POST(req: Request) {
  const { name } = await req.json().catch(() => ({} as any))
  const trimmed = (name ?? "").trim()
  if (!trimmed) return NextResponse.json({ error: "Pipeline name is required" }, { status: 400 })

  const cookieStore = cookies()
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: member, error: memberErr } = await supabase
    .from("app_members")
    .select("role")
    .eq("user_id", user.id)          
    .single()

  if (memberErr || !member) return NextResponse.json({ error: "Membership not found" }, { status: 403 })
  if (member.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Insert pipeline
  const { data: inserted, error: insertErr } = await supabase
    .from("pipelines")
    .insert({ name: trimmed, created_by: user.id })
    .select("id, name, created_at")
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 })
  invalidateStageIdsCache()
  return NextResponse.json(inserted, { status: 201 })
}

export async function DELETE(req: Request) {
    const url = new URL(req.url)
    let name = url.searchParams.get("name")
    if (!name) {
      // allow body too, if you prefer
      try { const body = await req.json(); name = body?.name } catch {}
    }
    const trimmed = (name ?? "").trim()
    if (!trimmed) return NextResponse.json({ error: "Pipeline name is required" }, { status: 400 })
  
    const cookieStore = cookies()
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  
    const { data: member, error: memberErr } = await supabase
      .from("app_members")
      .select("role")
      .eq("user_id", user.id)  
      .single()
  
    if (memberErr || !member) return NextResponse.json({ error: "Membership not found" }, { status: 403 })
    if (member.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  
    // find pipeline by exact name
    const { data: pipelines, error: findErr } = await supabase
      .from("pipelines")
      .select("id, name")
      .eq("name", trimmed)
  
    if (findErr) return NextResponse.json({ error: findErr.message }, { status: 400 })
    if (!pipelines || pipelines.length === 0) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 })
    }
    if (pipelines.length > 1) {
      return NextResponse.json({ error: "Multiple pipelines with this name; delete requires an id" }, { status: 409 })
    }
  
    const pipelineId = pipelines[0].id
  
    // collect lead ids assigned to this pipeline
    const { data: lpRows, error: lpErr } = await supabase
      .from("lead_pipelines")
      .select("lead_id")
      .eq("pipeline_id", pipelineId)
  
    if (lpErr) return NextResponse.json({ error: lpErr.message }, { status: 400 })
  
    const leadIds = Array.from(new Set((lpRows ?? []).map(r => r.lead_id))).filter(Boolean)
  
    // 1) stage_history (by pipeline)
    const sh1 = await supabase.from("stage_history").delete().eq("pipeline_id", pipelineId)
    if (sh1.error) return NextResponse.json({ error: sh1.error.message }, { status: 400 })
  
    // 2) lead_pipelines
    const lpDel = await supabase.from("lead_pipelines").delete().eq("pipeline_id", pipelineId)
    if (lpDel.error) return NextResponse.json({ error: lpDel.error.message }, { status: 400 })
  
    // 3) stages
    const stDel = await supabase.from("stages").delete().eq("pipeline_id", pipelineId)
    if (stDel.error) return NextResponse.json({ error: stDel.error.message }, { status: 400 })
  
    // 4) leads (those that belonged to this pipeline)
    if (leadIds.length) {
      const lDel = await supabase.from("leads").delete().in("id", leadIds)
      if (lDel.error) return NextResponse.json({ error: lDel.error.message }, { status: 400 })
    }
  
    // 5) pipeline
    const pDel = await supabase.from("pipelines").delete().eq("id", pipelineId)
    if (pDel.error) return NextResponse.json({ error: pDel.error.message }, { status: 400 })

    invalidateStageIdsCache()
    return NextResponse.json({ ok: true, deleted: { pipelineId, leadCount: leadIds.length } })
  }
