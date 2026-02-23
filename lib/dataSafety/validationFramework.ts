/**
 * Validation Framework - Validare în 3 straturi
 * 1. Client Validation - Validare înainte de a trimite datele
 * 2. Edge/API Validation - Validare la nivel de API route
 * 3. Server Validation - Validare la nivel de database (Supabase RLS/Triggers)
 */

import { z } from 'zod';

// ============================================
// LAYER 1: CLIENT VALIDATION SCHEMAS
// ============================================

export const leadSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Name is required').max(255),
  phone: z.string().min(10, 'Phone must be at least 10 characters'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  stage_id: z.string().uuid('Invalid stage ID'),
  pipeline_id: z.string().uuid('Invalid pipeline ID'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  source: z.string().optional(),
  notes: z.string().max(5000).optional(),
});

export const stageChangeSchema = z.object({
  lead_id: z.string().uuid('Invalid lead ID'),
  from_stage_id: z.string().uuid('Invalid from stage ID'),
  to_stage_id: z.string().uuid('Invalid to stage ID'),
  notes: z.string().max(1000).optional(),
  performed_by: z.string().uuid('Invalid user ID'),
});

export const serviceFileSchema = z.object({
  id: z.string().uuid().optional(),
  tray_id: z.string().uuid('Invalid tray ID'),
  service_type: z.enum(['REPAIR', 'CLEANING', 'INSPECTION', 'UPGRADE']),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  notes: z.string().max(2000).optional(),
});

export const callbackSchema = z.object({
  id: z.string().uuid().optional(),
  lead_id: z.string().uuid('Invalid lead ID'),
  scheduled_at: z.string().datetime('Invalid datetime'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  notes: z.string().max(1000).optional(),
  assigned_to: z.string().uuid('Invalid assignee ID'),
});

export const messageSchema = z.object({
  id: z.string().uuid().optional(),
  lead_id: z.string().uuid('Invalid lead ID'),
  content: z.string().min(1, 'Message content is required').max(5000),
  sender_id: z.string().uuid('Invalid sender ID'),
  message_type: z.enum(['TEXT', 'NOTE', 'SYSTEM']).optional(),
});

// ============================================
// LAYER 2: EDGE/API VALIDATION MIDDLEWARE
// ============================================

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export async function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: any
): Promise<T> {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw new ValidationError(
        firstError.message,
        firstError.path.join('.'),
        'VALIDATION_ERROR'
      );
    }
    throw error;
  }
}

export function handleValidationError(error: unknown) {
  if (error instanceof ValidationError) {
    return {
      success: false,
      error: error.message,
      field: error.field,
      code: error.code,
    };
  }
  
  return {
    success: false,
    error: error instanceof Error ? error.message : 'Unknown error',
    code: 'INTERNAL_ERROR',
  };
}

// ============================================
// BUSINESS LOGIC VALIDATION
// ============================================

export class BusinessLogicValidator {
  /**
   * Validează dacă lead-ul poate fi mutat în stage-ul respectiv
   */
  static validateStageTransition(
    currentStageId: string,
    targetStageId: string,
    pipelineStages: Array<{ id: string; order: number }>
  ): { valid: boolean; error?: string } {
    // Verifică dacă ambele stages există în pipeline
    const currentStage = pipelineStages.find(s => s.id === currentStageId);
    const targetStage = pipelineStages.find(s => s.id === targetStageId);

    if (!currentStage || !targetStage) {
      return { valid: false, error: 'Stage not found in pipeline' };
    }

    // Verifică dacă tranziția e validă (nu e același stage)
    if (currentStageId === targetStageId) {
      return { valid: false, error: 'Cannot move to same stage' };
    }

    return { valid: true };
  }

  /**
   * Validează dacă numărul de callbacks e în limită
   */
  static validateCallbackLimit(
    leadId: string,
    existingCallbacks: number,
    priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  ): { valid: boolean; error?: string; limit?: number } {
    const limits = {
      URGENT: 1,   // 1 per hour
      HIGH: 3,      // 3 per hour
      NORMAL: 5,    // 5 per hour
      LOW: 8,       // 8 per hour
    };

    const limit = limits[priority];

    if (existingCallbacks >= limit) {
      return {
        valid: false,
        error: `Callback limit reached (${limit} per ${priority})`,
        limit,
      };
    }

    return { valid: true, limit };
  }

  /**
   * Validează dacă service file poate fi creat
   */
  static validateServiceFileCreation(
    trayId: string,
    existingServiceFiles: Array<any>
  ): { valid: boolean; error?: string; existing?: any } {
    // Verifică dacă există deja un service file pentru tray
    const existing = existingServiceFiles.find(
      sf => sf.tray_id === trayId && sf.status !== 'CANCELLED'
    );

    if (existing) {
      return {
        valid: false,
        error: 'Service file already exists for this tray',
        existing,
      };
    }

    return { valid: true };
  }

  /**
   * Validează dacă lead-ul nu e într-un loop
   */
  static validateLeadHistoryLoop(
    leadHistory: Array<{ stage_id: string; created_at: string }>,
    maxRepeats: number = 3
  ): { valid: boolean; inLoop: boolean; error?: string } {
    if (leadHistory.length < maxRepeats * 2) {
      return { valid: true, inLoop: false };
    }

    // Verifică ultimele N tranziții
    const recentHistory = leadHistory.slice(-maxRepeats * 2);

    // Caută pattern-uri de loop (A -> B -> A -> B...)
    let inLoop = false;
    for (let i = 0; i < recentHistory.length - 2; i++) {
      const currentStage = recentHistory[i].stage_id;
      const nextStage = recentHistory[i + 1].stage_id;
      
      // Verifică dacă pattern-ul se repetă
      for (let j = i + 2; j < recentHistory.length - 1; j += 2) {
        if (
          recentHistory[j].stage_id === currentStage &&
          recentHistory[j + 1].stage_id === nextStage
        ) {
          inLoop = true;
          break;
        }
      }
      
      if (inLoop) break;
    }

    if (inLoop) {
      return {
        valid: false,
        inLoop: true,
        error: 'Lead is in a loop - breaking the cycle',
      };
    }

    return { valid: true, inLoop: false };
  }

  /**
   * Validează dacă datele sunt consistente
   */
  static validateDataConsistency(
    lead: any,
    stage: any,
    pipeline: any
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Verifică dacă stage-ul aparține de pipeline-ul lead-ului
    if (stage.pipeline_id !== pipeline.id) {
      errors.push('Stage does not belong to the lead\'s pipeline');
    }

    // Verifică dacă lead-ul are date obligatorii
    if (!lead.name || lead.name.trim() === '') {
      errors.push('Lead name is required');
    }

    if (!lead.phone || lead.phone.length < 10) {
      errors.push('Lead phone number is invalid');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// ============================================
// LAYER 3: DATABASE VALIDATION HELPERS
// ============================================

/**
 * SQL triggers și RLS policies vor fi implementate în Supabase
 * Acestea sunt helper-uri pentru generare SQL
 */

export const RLSPolicies = {
  // Users can only see leads from their organization
  leads: `
    CREATE POLICY "Users can view leads from their org"
    ON leads FOR SELECT
    USING (organization_id = auth.uid()::text OR 
           EXISTS (
             SELECT 1 FROM user_organizations 
             WHERE user_id = auth.uid() 
             AND organization_id = leads.organization_id
           ));
  `,

  // Users can only modify leads they have access to
  leadsUpdate: `
    CREATE POLICY "Users can update leads they have access to"
    ON leads FOR UPDATE
    USING (
      organization_id = auth.uid()::text OR
      EXISTS (
        SELECT 1 FROM user_organizations 
        WHERE user_id = auth.uid() 
        AND organization_id = leads.organization_id
      )
    );
  `,

  // Users can only see their own messages or messages from leads they have access to
  messages: `
    CREATE POLICY "Users can view messages from their leads"
    ON messages FOR SELECT
    USING (
      sender_id = auth.uid()::text OR
      EXISTS (
        SELECT 1 FROM leads 
        WHERE leads.id = messages.lead_id 
        AND (
          leads.organization_id = auth.uid()::text OR
          EXISTS (
            SELECT 1 FROM user_organizations 
            WHERE user_id = auth.uid() 
            AND organization_id = leads.organization_id
          )
        )
      )
    );
  `,
};

export const DatabaseConstraints = {
  // Check constraints pentru validare la nivel de database
  leadPhoneFormat: `
    ALTER TABLE leads 
    ADD CONSTRAINT valid_phone_format 
    CHECK (phone ~ '^[0-9+\-\s()]{10,}$');
  `,

  leadEmailFormat: `
    ALTER TABLE leads 
    ADD CONSTRAINT valid_email_format 
    CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$' OR email = '');
  `,

  callbackFutureDate: `
    ALTER TABLE callbacks 
    ADD CONSTRAINT callback_in_future 
    CHECK (scheduled_at >= NOW());
  `,

  serviceFileStatus: `
    ALTER TABLE service_files 
    ADD CONSTRAINT valid_service_file_status 
    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'));
  `,
};

// ============================================
// ROLLBACK PROCEDURES
// ============================================

export interface RollbackPlan {
  id: string;
  timestamp: string;
  changes: Array<{
    type: 'INSERT' | 'UPDATE' | 'DELETE';
    table: string;
    data: any;
    previousData?: any;
  }>;
  rollbackSteps: Array<{
    step: number;
    action: string;
    sql?: string;
    data?: any;
  }>;
}

export class RollbackManager {
  private rollbackPlans: Map<string, RollbackPlan> = new Map();

  /**
   * Creare plan de rollback înainte de operațiune
   */
  createRollbackPlan(operationId: string): RollbackPlan {
    const plan: RollbackPlan = {
      id: operationId,
      timestamp: new Date().toISOString(),
      changes: [],
      rollbackSteps: [],
    };

    this.rollbackPlans.set(operationId, plan);
    return plan;
  }

  /**
   * Adăugare modificare la plan
   */
  recordChange(
    operationId: string,
    type: 'INSERT' | 'UPDATE' | 'DELETE',
    table: string,
    data: any,
    previousData?: any
  ) {
    const plan = this.rollbackPlans.get(operationId);
    if (!plan) {
      throw new Error(`Rollback plan not found: ${operationId}`);
    }

    plan.changes.push({ type, table, data, previousData });
  }

  /**
   * Generare pași de rollback
   */
  generateRollbackSteps(operationId: string) {
    const plan = this.rollbackPlans.get(operationId);
    if (!plan) {
      throw new Error(`Rollback plan not found: ${operationId}`);
    }

    // Procesăm changes în ordine inversă
    let stepNumber = 1;
    for (let i = plan.changes.length - 1; i >= 0; i--) {
      const change = plan.changes[i];

      if (change.type === 'INSERT') {
        // Rollback INSERT → DELETE
        plan.rollbackSteps.push({
          step: stepNumber++,
          action: `DELETE from ${change.table} where id = '${change.data.id}'`,
          sql: `DELETE FROM ${change.table} WHERE id = $1`,
          data: [change.data.id],
        });
      } else if (change.type === 'UPDATE') {
        // Rollback UPDATE → UPDATE with previous data
        plan.rollbackSteps.push({
          step: stepNumber++,
          action: `UPDATE ${change.table} with previous data`,
          sql: `UPDATE ${change.table} SET ... WHERE id = $1`,
          data: change.previousData,
        });
      } else if (change.type === 'DELETE') {
        // Rollback DELETE → INSERT
        plan.rollbackSteps.push({
          step: stepNumber++,
          action: `INSERT into ${change.table}`,
          sql: `INSERT INTO ${change.table} (...) VALUES (...)`,
          data: change.data,
        });
      }
    }
  }

  /**
   * Executare rollback
   */
  async executeRollback(operationId: string) {
    const plan = this.rollbackPlans.get(operationId);
    if (!plan) {
      throw new Error(`Rollback plan not found: ${operationId}`);
    }

    console.log(`[RollbackManager] Executing rollback for ${operationId}`);

    // Implementare în faza ulterioară - va folosi database transactions
    for (const step of plan.rollbackSteps) {
      console.log(`[RollbackManager] Step ${step.step}: ${step.action}`);
      // Execute rollback step
    }

    console.log(`[RollbackManager] Rollback completed for ${operationId}`);
  }

  /**
   * Ștergere plan după confirmare
   */
  confirmOperation(operationId: string) {
    this.rollbackPlans.delete(operationId);
  }
}

export const rollbackManager = new RollbackManager();