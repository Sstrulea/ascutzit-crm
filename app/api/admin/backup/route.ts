/**
 * API Route pentru backup-uri baze de date
 * POST - Creare backup manual
 * GET - Lista backup-uri disponibile
 * PUT - Restaurare din backup
 * DELETE - Ștergere backup
 * Doar owner poate accesa.
 */

import { NextRequest, NextResponse } from 'next/server';
import { backupManager } from '@/lib/dataSafety/backupManager';
import { requireOwner } from '@/lib/supabase/api-helpers';

async function ensureOwner() {
  try {
    await requireOwner();
  } catch (err: unknown) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
}

/**
 * POST - Creare backup manual
 */
export async function POST(request: NextRequest) {
  const authResponse = await ensureOwner();
  if (authResponse) return authResponse;
  try {
    const body = await request.json();
    const type = body.type || 'manual'; // 'hourly', 'daily', sau 'manual'

    if (!['hourly', 'daily', 'manual'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid backup type' },
        { status: 400 }
      );
    }

    const metadata = await backupManager.createBackup(type);

    return NextResponse.json({
      success: true,
      message: 'Backup created successfully',
      metadata,
    });
  } catch (error) {
    console.error('[Backup API] Error creating backup:', error);
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
 * GET - Lista backup-uri disponibile
 */
export async function GET() {
  const authResponse = await ensureOwner();
  if (authResponse) return authResponse;
  try {
    const fs = require('fs');
    const path = require('path');
    const fsPromises = require('fs/promises');

    const backupPath = path.join(process.cwd(), 'backups', 'database');
    
    if (!fs.existsSync(backupPath)) {
      return NextResponse.json({
        success: true,
        backups: [],
      });
    }

    const files = await fsPromises.readdir(backupPath);
    const backups = files
      .filter((file: string) => file.startsWith('backup-') && file.endsWith('.json'))
      .map((file: string) => {
        const filePath = path.join(backupPath, file);
        const stats = fs.statSync(filePath);
        
        return {
          filename: file,
          path: filePath,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
        };
      })
      .sort((a: any, b: any) => b.created - a.created);

    return NextResponse.json({
      success: true,
      backups,
    });
  } catch (error) {
    console.error('[Backup API] Error listing backups:', error);
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
 * PUT - Restaurare din backup
 */
export async function PUT(request: NextRequest) {
  const authResponse = await ensureOwner();
  if (authResponse) return authResponse;
  try {
    const body = await request.json();
    const { backupPath } = body;

    if (!backupPath) {
      return NextResponse.json(
        { success: false, error: 'backupPath is required' },
        { status: 400 }
      );
    }

    // Verificare integritate backup înainte de restaurare
    const isValid = await backupManager.verifyBackup(backupPath);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Backup verification failed' },
        { status: 400 }
      );
    }

    await backupManager.restoreFromBackup(backupPath);

    return NextResponse.json({
      success: true,
      message: 'Backup restored successfully',
    });
  } catch (error) {
    console.error('[Backup API] Error restoring backup:', error);
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
 * DELETE - Ștergere backup
 */
export async function DELETE(request: NextRequest) {
  const authResponse = await ensureOwner();
  if (authResponse) return authResponse;
  try {
    const { searchParams } = new URL(request.url);
    const backupPath = searchParams.get('path');

    if (!backupPath) {
      return NextResponse.json(
        { success: false, error: 'backupPath is required' },
        { status: 400 }
      );
    }

    const fs = require('fs');
    const fsPromises = require('fs/promises');

    if (!fs.existsSync(backupPath)) {
      return NextResponse.json(
        { success: false, error: 'Backup file not found' },
        { status: 404 }
      );
    }

    await fsPromises.unlink(backupPath);

    return NextResponse.json({
      success: true,
      message: 'Backup deleted successfully',
    });
  } catch (error) {
    console.error('[Backup API] Error deleting backup:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}