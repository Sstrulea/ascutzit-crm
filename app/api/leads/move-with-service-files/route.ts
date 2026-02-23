import { moveLeadsWithServiceFilesToOldStage } from '@/lib/supabase/pipelineOperations'
import { NextResponse } from 'next/server'

/**
 * POST /api/leads/move-with-service-files
 * 
 * Mişte lead-urile care au cel puţin o fişă de serviciu în stagiul "Lead-uri Vechi" din pipeline-ul "Vânzări".
 * Aceasta e o operaţie de batch care identifică todas lead-urile cu servicii și le organizează.
 * 
 * Response:
 * {
 *   success: boolean,
 *   movedLeadsCount: number,
 *   message: string,
 *   error?: string
 * }
 */
export async function POST(request: Request) {
  try {
    const result = await moveLeadsWithServiceFilesToOldStage()
    
    if (!result.success) {
      return NextResponse.json({
        success: false,
        movedLeadsCount: 0,
        message: 'Failed to move leads',
        error: result.error,
      }, { status: 400 })
    }
    
    return NextResponse.json({
      success: true,
      movedLeadsCount: result.movedLeadsCount,
      message: `Successfully moved ${result.movedLeadsCount} lead(s) to "Lead-uri Vechi" stage`,
    }, { status: 200 })
  } catch (error: any) {
    console.error('[/api/leads/move-with-service-files] Error:', error)
    
    return NextResponse.json({
      success: false,
      movedLeadsCount: 0,
      message: 'Internal server error',
      error: error?.message || 'Unknown error',
    }, { status: 500 })
  }
}

