/**
 * Backup Manager - Protecție automată a datelor
 * Implementează backup-uri periodice și read-only snapshots
 */

import { createClient } from '@supabase/supabase-js';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import path from 'path';

interface BackupConfig {
  hourlyRetention: number;  // ore de păstrare
  dailyRetention: number;   // zile de păstrare
  backupPath: string;
}

interface BackupMetadata {
  timestamp: string;
  type: 'hourly' | 'daily' | 'manual';
  tables: string[];
  size: number;
  checksum: string;
}

export class BackupManager {
  private supabase;
  private config: BackupConfig;

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Service role pentru backup-uri
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.config = {
      hourlyRetention: 24, // 24 ore
      dailyRetention: 7,   // 7 zile
      backupPath: path.join(process.cwd(), 'backups', 'database'),
    };
  }

  /**
   * Creare backup complet al bazei de date
   */
  async createBackup(type: 'hourly' | 'daily' | 'manual' = 'manual'): Promise<BackupMetadata> {
    const timestamp = new Date().toISOString();
    const tables = await this.getTableList();
    
    console.log(`[BackupManager] Starting ${type} backup at ${timestamp}`);
    
    // Creare director backup dacă nu există
    if (!existsSync(this.config.backupPath)) {
      await mkdir(this.config.backupPath, { recursive: true });
    }

    const backupData: any = {
      metadata: {
        timestamp,
        type,
        tables,
        version: '1.0.0',
      },
      data: {} as Record<string, any[]>,
    };

    // Export date din fiecare tabel
    for (const table of tables) {
      try {
        const { data, error } = await this.supabase
          .from(table)
          .select('*')
          .limit(10000); // Limitare pentru a evita probleme

        if (error) {
          console.error(`[BackupManager] Error backing up ${table}:`, error);
          continue;
        }

        backupData.data[table] = data || [];
        console.log(`[BackupManager] Backed up ${table}: ${data?.length || 0} rows`);
      } catch (err) {
        console.error(`[BackupManager] Error in table ${table}:`, err);
      }
    }

    // Calculare checksum
    const checksum = await this.calculateChecksum(backupData);
    backupData.metadata.checksum = checksum;

    // Salvare backup pe disc
    const filename = `backup-${type}-${timestamp.replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(this.config.backupPath, filename);
    
    await writeFile(filepath, JSON.stringify(backupData, null, 2), 'utf-8');
    
    const stats = statSync(filepath);
    const fileSize = stats.size / 1024; // KB

    const metadata: BackupMetadata = {
      timestamp,
      type,
      tables,
      size: fileSize,
      checksum,
    };

    console.log(`[BackupManager] Backup completed: ${filename} (${fileSize.toFixed(2)} KB)`);
    return metadata;
  }

  /**
   * Creare read-only snapshot (pointer la backup)
   */
  async createReadOnlySnapshot(backupPath: string): Promise<string> {
    const timestamp = new Date().toISOString();
    const snapshotPath = path.join(
      this.config.backupPath,
      'snapshots',
      `snapshot-${timestamp.replace(/[:.]/g, '-')}.json`
    );

    const snapshotData = {
      timestamp,
      backupPath,
      type: 'readonly',
      readOnly: true,
    };

    await mkdir(path.dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, JSON.stringify(snapshotData, null, 2), 'utf-8');

    console.log(`[BackupManager] Read-only snapshot created: ${snapshotPath}`);
    return snapshotPath;
  }

  /**
   * Restaurare din backup
   */
  async restoreFromBackup(backupPath: string): Promise<void> {
    console.log(`[BackupManager] Starting restore from ${backupPath}`);
    
    // Verificare dacă backup-ul există
    if (!existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    // Citire backup
    const backupContent = await readFile(backupPath, 'utf-8');
    const backupData = JSON.parse(backupContent);

    // Verificare checksum
    const currentChecksum = await this.calculateChecksum(backupData);
    if (currentChecksum !== backupData.metadata.checksum) {
      throw new Error('Backup checksum mismatch! Data may be corrupted.');
    }

    // Restaurare date
    for (const [table, rows] of Object.entries(backupData.data)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;

      try {
        // Delete existing data
        await this.supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        
        // Insert backup data
        const { error } = await this.supabase.from(table).insert(rows);
        
        if (error) {
          console.error(`[BackupManager] Error restoring ${table}:`, error);
          throw error;
        }

        console.log(`[BackupManager] Restored ${table}: ${rows.length} rows`);
      } catch (err) {
        console.error(`[BackupManager] Error in table ${table}:`, err);
        throw err;
      }
    }

    console.log(`[BackupManager] Restore completed successfully`);
  }

  /**
   * Cleanup backup-uri vechi
   */
  async cleanupOldBackups(): Promise<void> {
    console.log('[BackupManager] Cleaning up old backups...');
    // Implementare în faza ulterioară - fișier sistem operations
  }

  /**
   * Get lista tabele din baza de date
   */
  private async getTableList(): Promise<string[]> {
    // Tabele principale cunoscute
    return [
      'leads',
      'stages',
      'pipelines',
      'service_files',
      'trays',
      'users',
      'profiles',
      'messages',
      'lead_history',
      'work_sessions',
      'tracking_events',
      'notifications',
    ];
  }

  /**
   * Calculare checksum pentru verificare integritate
   */
  private async calculateChecksum(data: any): Promise<string> {
    const str = JSON.stringify(data);
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(str));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Verificare integritate backup
   */
  async verifyBackup(backupPath: string): Promise<boolean> {
    try {
      const backupContent = await readFile(backupPath, 'utf-8');
      const backupData = JSON.parse(backupContent);
      
      const currentChecksum = await this.calculateChecksum(backupData);
      return currentChecksum === backupData.metadata.checksum;
    } catch (err) {
      console.error('[BackupManager] Backup verification failed:', err);
      return false;
    }
  }
}

// Singleton instance
export const backupManager = new BackupManager();

/**
 * API Route pentru manual backup
 */
export async function POST() {
  try {
    const metadata = await backupManager.createBackup('manual');
    return Response.json({
      success: true,
      message: 'Backup created successfully',
      metadata,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}