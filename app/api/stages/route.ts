// app/api/stages/route.ts
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { invalidateStageIdsCache } from "@/lib/supabase/tehnicianDashboardStageIdsCache"

const toSlug = (s: string) => s.toLowerCase().replace(/\s+/g, "-")

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { pipelineSlug, name } = await req.json()
    if (!pipelineSlug || !name?.trim()) {
      return NextResponse.json({ error: "Missing pipelineSlug or name" }, { status: 400 })
    }

    // Verifică rolul utilizatorului
    const { data: member, error: memberErr } = await supabase
      .from("app_members")
      .select("role")
      .eq("user_id", user.id)
      .single()

    if (memberErr || !member) {
      return NextResponse.json({ error: "Membership not found" }, { status: 403 })
    }

    if (member.role !== "owner") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Find pipeline by slugified name
    const { data: pipes, error: pErr } = await supabase
      .from("pipelines")
      .select("id, name, created_by")

    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 })
    }

    const pipeline = (pipes || []).find(p => toSlug(p.name) === pipelineSlug)
    if (!pipeline) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 })
    }

    // Next position in this pipeline
    const { data: lastStage } = await supabase
      .from("stages")
      .select("position")
      .eq("pipeline_id", pipeline.id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle()

    const position = (lastStage?.position ?? -1) + 1

    const { data: inserted, error: iErr } = await supabase
      .from("stages")
      .insert({
        name: name.trim(),
        pipeline_id: pipeline.id,
        position,
      })
      .select()
      .single()

    if (iErr) {
      return NextResponse.json({ error: iErr.message }, { status: 500 })
    }

    invalidateStageIdsCache()
    return NextResponse.json({ stage: inserted })
  } catch (error: any) {
    console.error('Error creating stage:', error)
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { pipelineSlug, stageName } = await req.json()
    if (!pipelineSlug || !stageName) {
      return NextResponse.json({ error: "Missing pipelineSlug or stageName" }, { status: 400 })
    }

    // Verifică rolul utilizatorului
    const { data: member, error: memberErr } = await supabase
      .from("app_members")
      .select("role")
      .eq("user_id", user.id)
      .single()

    if (memberErr || !member) {
      return NextResponse.json({ error: "Membership not found" }, { status: 403 })
    }

    if (member.role !== "owner") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // 1) Resolve pipeline by slugified name
    const { data: pipes, error: pErr } = await supabase
      .from("pipelines")
      .select("id, name, created_by")
    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 })
    }

    const pipeline = (pipes || []).find(p => toSlug(p.name) === pipelineSlug)
    if (!pipeline) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 })
    }

    // 2) Find the stage in this pipeline
    const { data: stage, error: sErr } = await supabase
      .from("stages")
      .select("id, name, position")
      .eq("pipeline_id", pipeline.id)
      .eq("name", stageName)
      .single()
    if (sErr || !stage) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 })
    }

    // 3) Leads currently in this stage (for this pipeline) - folosim pipeline_items
    const { data: lpRows, error: lpErr } = await supabase
      .from("pipeline_items")
      .select("id, item_id")
      .eq("pipeline_id", pipeline.id)
      .eq("stage_id", stage.id)
      .eq("type", "lead")
    if (lpErr) {
      return NextResponse.json({ error: lpErr.message }, { status: 500 })
    }

    const leadIds = (lpRows || []).map(r => r.item_id)

    // 4) Delete stage history for those leads but ONLY within this pipeline
    if (leadIds.length > 0) {
      const { error: shDelErr } = await supabase
        .from("stage_history")
        .delete()
        .eq("pipeline_id", pipeline.id)
        .in("lead_id", leadIds)
      if (shDelErr) {
        return NextResponse.json({ error: shDelErr.message }, { status: 500 })
      }
    }

    // 5) Delete lead assignments for this stage in this pipeline
    if (lpRows?.length) {
      const lpIds = lpRows.map(r => r.id)
      const { error: lpDelErr } = await supabase
        .from("pipeline_items")
        .delete()
        .in("id", lpIds)
      if (lpDelErr) {
        return NextResponse.json({ error: lpDelErr.message }, { status: 500 })
      }
    }

    // 6) Delete orphan leads (those from above that now have zero assignments anywhere)
    if (leadIds.length > 0) {
      const { data: stillAssigned, error: stillErr } = await supabase
        .from("pipeline_items")
        .select("item_id")
        .eq("type", "lead")
        .in("item_id", leadIds)

      if (stillErr) {
        return NextResponse.json({ error: stillErr.message }, { status: 500 })
      }

      const stillSet = new Set((stillAssigned || []).map(r => r.item_id))
      const orphanIds = leadIds.filter(id => !stillSet.has(id))

      if (orphanIds.length > 0) {
        const { error: leadsDelErr } = await supabase
          .from("leads")
          .delete()
          .in("id", orphanIds)
        if (leadsDelErr) {
          return NextResponse.json({ error: leadsDelErr.message }, { status: 500 })
        }
      }
    }

    // 7) Delete the stage
    const { error: stageDelErr } = await supabase
      .from("stages")
      .delete()
      .eq("id", stage.id)
    if (stageDelErr) {
      return NextResponse.json({ error: stageDelErr.message }, { status: 500 })
    }

    invalidateStageIdsCache()

    // 8) Compact positions (0..n-1) for remaining stages in this pipeline
    const { data: stagesLeft, error: stLeftErr } = await supabase
      .from("stages")
      .select("id")
      .eq("pipeline_id", pipeline.id)
      .order("position", { ascending: true })

    if (!stLeftErr && stagesLeft) {
      // reindex sequentially
      for (let i = 0; i < stagesLeft.length; i++) {
        const st = stagesLeft[i]
        // Note: PostgREST can't do "position = position - 1" expressions directly; update each.
        await supabase.from("stages").update({ position: i }).eq("id", st.id)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Error deleting stage:', error)
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 })
  }
}
