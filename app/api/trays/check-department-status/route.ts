import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Stage-uri valide în pipeline-ul corect (pentru culoare verde)
const VALID_STAGES_IN_CORRECT_PIPELINE = [
  'noua', 'nou',
  'in lucru', 'în lucru', 'in_lucru',
  'retur',
  'în așteptare', 'in_asteptare', 'asteptare',
  'finalizare', 'finalizata', 'finalizat',
].map(s => s.toLowerCase())

// Mapping departamente -> pipeline-uri
const DEPARTMENT_PIPELINES: Record<string, string[]> = {
  'Horeca': ['horeca', 'horeca-instruments'],
  'Saloane': ['saloane', 'saloane-instruments'],
  'Frizerii': ['frizerii', 'frizerii-instruments'],
  'Reparatii': ['reparatii', 'reparatii-instruments', 'service'],
}

// Pipeline-uri valide pentru toate departamentele
const VALID_PIPELINES = [
  ...DEPARTMENT_PIPELINES.Horeca,
  ...DEPARTMENT_PIPELINES.Saloane,
  ...DEPARTMENT_PIPELINES.Frizerii,
  ...DEPARTMENT_PIPELINES.Reparatii,
  'receptie', 'receptie-instruments', // Recepție nu este departament tehnic
]

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** instruments.pipeline poate fi UUID sau nume (ex: "Reparatii", "Reparatii-instruments"). Rezolvă la { id, name }. */
async function resolvePipelineValue(supabase: any, value: string): Promise<{ id: string; name: string } | null> {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (UUID_REGEX.test(trimmed)) {
    const { data } = await supabase.from('pipelines').select('id, name').eq('id', trimmed).single()
    return data ? { id: data.id, name: data.name } : null
  }

  // Match exact sau prefix (ex: "Reparatii" → "Reparatii" sau "Reparatii-instruments")
  const { data } = await supabase
    .from('pipelines')
    .select('id, name')
    .ilike('name', trimmed + '%')
    .limit(1)
    .maybeSingle()
  return data ? { id: data.id, name: data.name } : null
}

// Funcție helper pentru a determina departamentul din numele pipeline-ului
function getDepartmentFromPipeline(pipelineName: string): string | null {
  const name = pipelineName.toLowerCase()
  if (name.includes('horeca')) return 'Horeca'
  if (name.includes('saloane')) return 'Saloane'
  if (name.includes('frizerii')) return 'Frizerii'
  if (name.includes('reparatii') || name.includes('service')) return 'Reparatii'
  return null
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const serviceFileId = searchParams.get('serviceFileId')

    if (!serviceFileId) {
      return NextResponse.json(
        { error: 'serviceFileId is required' },
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Obținem tăvițele fișei de service din tabelul TRAYS
    const { data: trays, error: traysError } = await supabase
      .from('trays')
      .select('id, number, service_file_id')
      .eq('service_file_id', serviceFileId)

    if (traysError) {
      console.error('Eroare la încărcarea tăvițelor:', traysError)
      return NextResponse.json(
        { error: 'Eroare la încărcarea tăvițelor' },
        { status: 500 }
      )
    }

    if (!trays || trays.length === 0) {
      return NextResponse.json({
        status: 'green', // Nicio tăviță = implicit verde
        trays: [],
        summary: {
          total: 0,
          correct: 0,
          missing: 0,
          wrongPipeline: 0,
        },
      })
    }

    let correct = 0
    let missing = 0
    let wrongPipeline = 0
    const trayDetails: any[] = []

    for (const tray of trays) {
      const trayId = tray.id
      const trayNumber = tray.number
      
      // Obținem instrumentele din tavita pentru a determina pipeline-ul corect
      const { data: trayItems, error: trayItemsError } = await supabase
        .from('tray_items')
        .select('instrument_id')
        .eq('tray_id', trayId)

      let correctPipelineName: string | null = null
      let correctPipelineId: string | null = null
      let hasMixedPipelines = false

      // Dacă sunt instrumente în tavita, determinăm pipeline-ul corect
      if (trayItems && trayItems.length > 0) {
        // Obținem pipeline-urile pentru fiecare instrument
        const pipelineIds = await Promise.all(
          trayItems.map(async (item: any) => {
            const { data: instrument } = await supabase
              .from('instruments')
              .select('pipeline, name')
              .eq('id', item.instrument_id)
              .single()
            return instrument?.pipeline
          })
        )

        // Filtrăm null-urile; instruments.pipeline poate fi UUID sau nume
        const uniquePipelineValues = [...new Set(pipelineIds.filter((id): id is string => id !== null && id !== undefined))]
        
        if (uniquePipelineValues.length === 1) {
          const resolved = await resolvePipelineValue(supabase, uniquePipelineValues[0])
          if (resolved) {
            correctPipelineId = resolved.id
            correctPipelineName = resolved.name.toLowerCase()
          }
        } else if (uniquePipelineValues.length > 1) {
          hasMixedPipelines = true
        }
      }
      
      // Obținem pipeline-ul și stage-ul curent din pipeline_items
      const { data: pipelineItem, error: pipelineError } = await supabase
        .from('pipeline_items')
        .select('stage_id, stages!inner(name, pipeline_id, pipelines!inner(name))')
        .eq('type', 'tray')
        .eq('item_id', trayId)
        .single()

      let currentPipeline = ''
      let currentPipelineDisplay = ''  // Păstrăm numele original pentru afișare
      let currentStage = ''
      let currentPipelineIdStr = ''

      if (pipelineItem && !pipelineError) {
        currentPipeline = (pipelineItem.stages as any).pipelines?.name?.toLowerCase() || ''
        currentPipelineDisplay = (pipelineItem.stages as any).pipelines?.name || ''  // Numele original
        currentStage = (pipelineItem.stages as any).name || ''
        currentPipelineIdStr = (pipelineItem.stages as any).pipelines?.id || ''
      }

      // Determinăm status-ul tavitei
      let status: 'correct' | 'missing' | 'wrong_pipeline' = 'missing'
      let expectedDepartment: string | null = null

      if (correctPipelineName) {
        expectedDepartment = getDepartmentFromPipeline(correctPipelineName)
        const currentDepartment = currentPipeline ? getDepartmentFromPipeline(currentPipeline) : null

        // Corect dacă: același pipeline ID SAU același departament (ex: Reparatii vs Reparatii-instruments)
        const isExactMatch = currentPipelineIdStr === correctPipelineId
        const isSameDepartment = expectedDepartment && currentDepartment && expectedDepartment === currentDepartment

        if (isExactMatch || isSameDepartment) {
          const isStageValid = VALID_STAGES_IN_CORRECT_PIPELINE.includes(currentStage.toLowerCase())
          if (isStageValid) {
            status = 'correct'
            correct++
          } else {
            status = 'wrong_pipeline'
            wrongPipeline++
          }
        } else if (currentPipeline) {
          status = 'wrong_pipeline'
          wrongPipeline++
        } else {
          status = 'missing'
          missing++
        }
      } else if (hasMixedPipelines) {
        status = 'wrong_pipeline'
        wrongPipeline++
      } else if (currentPipeline) {
        const department = getDepartmentFromPipeline(currentPipeline)
        if (department && DEPARTMENT_PIPELINES[department]) {
          status = 'correct'
          correct++
        } else {
          status = 'missing'
          missing++
        }
      } else {
        status = 'missing'
        missing++
      }

      trayDetails.push({
        trayId: tray.id,
        trayNumber: tray.number,
        department: expectedDepartment,
        correctPipelineName,
        currentPipeline: currentPipeline || null,
        currentPipelineDisplay: currentPipelineDisplay || null,  // Numele original pentru afișare
        currentPipelineId: currentPipelineIdStr || null,
        stage: currentStage,
        status,
      })
    }

    // Determină culoarea finală
    // MOV = cel puțin o tăviță în pipeline incorect
    // ROȘU = toate tăvițele lipsesc
    // GALBEN = unele lipsesc, unele corecte
    // VERDE = toate corecte
    let finalStatus: 'red' | 'yellow' | 'green' | 'purple'
    if (wrongPipeline > 0) {
      finalStatus = 'purple'
    } else if (missing === trays.length) {
      finalStatus = 'red'
    } else if (missing > 0) {
      finalStatus = 'yellow'
    } else {
      finalStatus = 'green'
    }

    return NextResponse.json({
      status: finalStatus,
      trays: trayDetails,
      summary: {
        total: trays.length,
        correct,
        missing,
        wrongPipeline,
      },
    })
  } catch (error) {
    console.error('Eroare la check-department-status:', error)
    return NextResponse.json(
      { error: 'Eroare internă de server' },
      { status: 500 }
    )
  }
}