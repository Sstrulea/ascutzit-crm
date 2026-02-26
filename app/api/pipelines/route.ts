import { NextResponse } from "next/server"
import { requireOwner } from "@/lib/supabase/api-helpers"
import { invalidateStageIdsCache } from "@/lib/supabase/tehnicianDashboardStageIdsCache"

export async function POST(req: Request) {
  try {
    const { user, admin } = await requireOwner()

    const { name } = await req.json().catch(() => ({} as any))
    const trimmed = (name ?? "").trim()
    if (!trimmed) return NextResponse.json({ error: "Pipeline name is required" }, { status: 400 })

    const { data: inserted, error: insertErr } = await admin
      .from("pipelines")
      .insert({ name: trimmed, created_by: user.id })
      .select("id, name, created_at")
      .single()

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 })
    invalidateStageIdsCache()
    return NextResponse.json(inserted, { status: 201 })
  } catch (error: any) {
    if (error instanceof Response) return error
    console.error('Error creating pipeline:', error)
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { admin } = await requireOwner()

    const url = new URL(req.url)
    let name = url.searchParams.get("name")
    if (!name) {
      try { const body = await req.json(); name = body?.name } catch {}
    }
    const trimmed = (name ?? "").trim()
    if (!trimmed) return NextResponse.json({ error: "Pipeline name is required" }, { status: 400 })

    const { data: pipelines, error: findErr } = await admin
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

    const { data: lpRows, error: lpErr } = await admin
      .from("lead_pipelines")
      .select("lead_id")
      .eq("pipeline_id", pipelineId)

    if (lpErr) return NextResponse.json({ error: lpErr.message }, { status: 400 })

    const leadIds = Array.from(new Set((lpRows ?? []).map(r => r.lead_id))).filter(Boolean)

    const sh1 = await admin.from("stage_history").delete().eq("pipeline_id", pipelineId)
    if (sh1.error) return NextResponse.json({ error: sh1.error.message }, { status: 400 })

    const lpDel = await admin.from("lead_pipelines").delete().eq("pipeline_id", pipelineId)
    if (lpDel.error) return NextResponse.json({ error: lpDel.error.message }, { status: 400 })

    const stDel = await admin.from("stages").delete().eq("pipeline_id", pipelineId)
    if (stDel.error) return NextResponse.json({ error: stDel.error.message }, { status: 400 })

    if (leadIds.length) {
      const lDel = await admin.from("leads").delete().in("id", leadIds)
      if (lDel.error) return NextResponse.json({ error: lDel.error.message }, { status: 400 })
    }

    const pDel = await admin.from("pipelines").delete().eq("id", pipelineId)
    if (pDel.error) return NextResponse.json({ error: pDel.error.message }, { status: 400 })

    invalidateStageIdsCache()
    return NextResponse.json({ ok: true, deleted: { pipelineId, leadCount: leadIds.length } })
  } catch (error: any) {
    if (error instanceof Response) return error
    console.error('Error deleting pipeline:', error)
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 })
  }
}
