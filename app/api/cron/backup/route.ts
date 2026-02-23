/**
 * Cron Job pentru Backup Automat
 * Rulează automat backup-uri hourly și daily
 * Endpoint: /api/cron/backup?cron_key=YOUR_SECRET_KEY
 */

import { NextRequest, NextResponse } from 'next/server';
import { backupManager } from '@/lib/dataSafety/backupManager';

// Secret key pentru protejarea endpoint-ului
const CRON_SECRET = process.env.CRON_SECRET || 'your-secret-key-change-in-production';

/**
 * Verifică dacă request-ul este autorizat
 */
function verifyAuthorization(request: NextRequest): boolean {
  const cronKey = request.nextUrl.searchParams.get('cron_key');
  return cronKey === CRON_SECRET;
}

/**
 * POST - Trigger backup automat
 * Query params:
 * - type: 'hourly' | 'daily' | 'manual'
 */
export async function POST(request: NextRequest) {
  // Verificare autorizare
  if (!verifyAuthorization(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const type = (searchParams.get('type') || 'hourly') as 'hourly' | 'daily' | 'manual';

    if (!['hourly', 'daily', 'manual'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid backup type' },
        { status: 400 }
      );
    }

    console.log(`[Cron Backup] Starting ${type} backup...`);
    
    // Creare backup
    const metadata = await backupManager.createBackup(type);

    // Cleanup backup-uri vechi
    await cleanupOldBackups(type);

    console.log(`[Cron Backup] ${type} backup completed successfully`);

    return NextResponse.json({
      success: true,
      message: `${type} backup completed`,
      metadata,
    });
  } catch (error) {
    console.error('[Cron Backup] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET - Status backup-uri
 */
export async function GET(request: NextRequest) {
  // Verificare autorizare
  if (!verifyAuthorization(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const fs = require('fs');
    const path = require('path');
    const fsPromises = require('fs/promises');

    const backupPath = path.join(process.cwd(), 'backups', 'database');
    
    if (!fs.existsSync(backupPath)) {
      return NextResponse.json({
        success: true,
        lastHourlyBackup: null,
        lastDailyBackup: null,
        totalBackups: 0,
      });
    }

    const files = await fsPromises.readdir(backupPath);
    const backups = files
      .filter((file: string) => file.startsWith('backup-') && file.endsWith('.json'))
      .map((file: string) => {
        const filePath = path.join(backupPath, file);
        const stats = fs.statSync(filePath);
        const type = file.includes('hourly') ? 'hourly' : 
                     file.includes('daily') ? 'daily' : 'manual';
        
        return {
          type,
          filename: file,
          created: stats.birthtime,
          size: stats.size,
        };
      })
      .sort((a: any, b: any) => b.created - a.created);

    const lastHourlyBackup = backups.find((b: any) => b.type === 'hourly') || null;
    const lastDailyBackup = backups.find((b: any) => b.type === 'daily') || null;

    return NextResponse.json({
      success: true,
      lastHourlyBackup,
      lastDailyBackup,
      totalBackups: backups.length,
    });
  } catch (error) {
    console.error('[Cron Backup] Error getting status:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Cleanup backup-uri vechi
 */
async function cleanupOldBackups(type: 'hourly' | 'daily' | 'manual') {
  const fs = require('fs');
  const path = require('path');
  const fsPromises = require('fs/promises');

  const backupPath = path.join(process.cwd(), 'backups', 'database');
  
  if (!fs.existsSync(backupPath)) {
    return;
  }

  const retentionHours = type === 'hourly' ? 24 : type === 'daily' ? 168 : 720; // 24h, 7d, 30d
  const cutoffDate = new Date(Date.now() - retentionHours * 60 * 60 * 1000);

  try {
    const files = await fsPromises.readdir(backupPath);
    
    for (const file of files) {
      if (!file.startsWith(`backup-${type}`) || !file.endsWith('.json')) {
        continue;
      }

      const filePath = path.join(backupPath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.birthtime < cutoffDate) {
        console.log(`[Cron Backup] Deleting old backup: ${file}`);
        await fsPromises.unlink(filePath);
      }
    }

    console.log(`[Cron Backup] Cleanup completed for ${type} backups`);
  } catch (error) {
    console.error('[Cron Backup] Error during cleanup:', error);
  }
}