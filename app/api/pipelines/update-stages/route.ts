import { NextResponse } from "next/server"
import { requireAdminOrOwner } from "@/lib/supabase/api-helpers"
import { invalidateStageIdsCache } from "@/lib/supabase/tehnicianDashboardStageIdsCache"

/**
 * Actualizează numele pipeline-ului și/sau ordinea și numele stage-urilor.
 * Body: { pipelineId: string, pipelineName?: string | null, stages: { id: string, name: string, position: number }[] }
 */
export async function POST(req: Request) {
  try {
    const { admin } = await requireAdminOrOwner()

    const body = await req.json().catch(() => ({} as any))
    const { pipelineId, pipelineName, stages } = body as {
      pipelineId?: string
      pipelineName?: string | null
      stages?: Array<{ id: string; name: string; position: number }>
    }

    if (!pipelineId || typeof pipelineId !== "string") {
      return NextResponse.json({ error: "pipelineId is required" }, { status: 400 })
    }
    if (!Array.isArray(stages) || stages.length === 0) {
      return NextResponse.json({ error: "stages must be a non-empty array" }, { status: 400 })
    }

    // Optional: update pipeline name
    if (pipelineName != null && String(pipelineName).trim() !== "") {
      const { error: updatePipeErr } = await admin
        .from("pipelines")
        .update({ name: String(pipelineName).trim() })
        .eq("id", pipelineId)
      if (updatePipeErr) {
        return NextResponse.json({ error: updatePipeErr.message }, { status: 500 })
      }
    }

    // Update each stage: name and position
    for (const s of stages) {
      if (!s.id || typeof s.name !== "string" || typeof s.position !== "number") continue
      const { error: stageErr } = await admin
        .from("stages")
        .update({
          name: String(s.name).trim(),
          position: s.position,
        })
        .eq("id", s.id)
        .eq("pipeline_id", pipelineId)
      if (stageErr) {
        return NextResponse.json({ error: `Stage ${s.id}: ${stageErr.message}` }, { status: 500 })
      }
    }

    invalidateStageIdsCache()
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    if (error instanceof Response) return error
    console.error("[update-stages]", error)
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 })
  }
}
