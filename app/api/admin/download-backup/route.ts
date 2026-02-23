/**
 * API Route pentru descărcare backup
 * GET /api/admin/download-backup?path=/path/to/backup.json
 * Doar owner poate accesa.
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { readFile } from 'fs/promises';
import { requireOwner } from '@/lib/supabase/api-helpers';

export async function GET(request: NextRequest) {
  try {
    await requireOwner();
  } catch (err: unknown) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const backupPath = searchParams.get('path');

    if (!backupPath) {
      return NextResponse.json(
        { success: false, error: 'Backup path is required' },
        { status: 400 }
      );
    }

    // Verifică dacă path-ul este valid și e în directorul de backup
    const backupDir = path.join(process.cwd(), 'backups', 'database');
    const normalizedPath = path.normalize(backupPath);

    if (!normalizedPath.startsWith(backupDir)) {
      return NextResponse.json(
        { success: false, error: 'Invalid backup path' },
        { status: 403 }
      );
    }

    // Citirea fișierului
    const fileContent = await readFile(normalizedPath, 'utf-8');
    
    // Returnare fișier ca download
    return new NextResponse(fileContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${path.basename(normalizedPath)}"`,
      },
    });
  } catch (error) {
    console.error('[Download Backup] Error:', error);
    
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return NextResponse.json(
        { success: false, error: 'Backup file not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}