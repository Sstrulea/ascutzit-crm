/**
 * Backup Manager Component
 * UI pentru vizualizare și gestionare backup-uri
 */

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Download, RefreshCw, Trash2, Database, Shield } from 'lucide-react';

interface BackupFile {
  filename: string;
  path: string;
  size: number;
  created: string;
  modified: string;
}

interface BackupStatus {
  lastHourlyBackup: BackupFile | null;
  lastDailyBackup: BackupFile | null;
  totalBackups: number;
}

export default function BackupManager() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Încărcare backup-uri
  const loadBackups = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/backup');
      const data = await response.json();

      if (data.success) {
        setBackups(data.backups || []);
      }
    } catch (error) {
      showMessage('error', 'Eroare la încărcarea backup-urilor');
    } finally {
      setLoading(false);
    }
  };

  // Încărcare status
  const loadStatus = async () => {
    try {
      const response = await fetch('/api/cron/backup?cron_key=test-key');
      const data = await response.json();

      if (data.success) {
        setStatus(data);
      }
    } catch (error) {
      console.error('Error loading status:', error);
    }
  };

  // Creare backup manual
  const createBackup = async (type: 'hourly' | 'daily' | 'manual' = 'manual') => {
    try {
      setCreating(true);
      const response = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', `Backup ${type} creat cu succes!`);
        await loadBackups();
      } else {
        showMessage('error', data.error || 'Eroare la crearea backup-ului');
      }
    } catch (error) {
      showMessage('error', 'Eroare la crearea backup-ului');
    } finally {
      setCreating(false);
    }
  };

  // Ștergere backup
  const deleteBackup = async (backupPath: string, filename: string) => {
    if (!confirm(`Ești sigur că vrei să ștergi backup-ul "${filename}"?`)) {
      return;
    }

    try {
      setDeleting(filename);
      const response = await fetch(`/api/admin/backup?path=${encodeURIComponent(backupPath)}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', 'Backup șters cu succes!');
        await loadBackups();
      } else {
        showMessage('error', data.error || 'Eroare la ștergerea backup-ului');
      }
    } catch (error) {
      showMessage('error', 'Eroare la ștergerea backup-ului');
    } finally {
      setDeleting(null);
    }
  };

  // Descărcare backup
  const downloadBackup = async (backupPath: string, filename: string) => {
    try {
      // Citim fișierul direct din sistemul de fișiere
      const response = await fetch(`/api/admin/download-backup?path=${encodeURIComponent(backupPath)}`);
      
      if (!response.ok) {
        throw new Error('Eroare la descărcare');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showMessage('success', 'Backup descărcat cu succes!');
    } catch (error) {
      showMessage('error', 'Eroare la descărcarea backup-ului');
    }
  };

  // Export complet baza de date
  const exportFullDatabase = async () => {
    // 1. Creează backup
    await createBackup('manual');
    // 2. Așteaptă puțin pentru a se crea
    await new Promise(resolve => setTimeout(resolve, 1000));
    // 3. Reîncărcă lista de backup-uri
    await loadBackups();
    // 4. Descarcă ultimul backup creat
    if (backups.length > 0) {
      await downloadBackup(backups[0].path, backups[0].filename);
    }
  };

  // Afișare mesaj
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Formatare dimensiune
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Formatare dată
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ro-RO');
  };

  useEffect(() => {
    loadBackups();
    loadStatus();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Database className="w-8 h-8" />
          Backup Manager
        </h1>
        <p className="text-muted-foreground mt-2">
          Gestionează backup-urile bazei de date
        </p>
      </div>

      {/* Status Cards */}
      {status && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Ultimul Backup Hourly</CardTitle>
            </CardHeader>
            <CardContent>
              {status.lastHourlyBackup ? (
                <div className="space-y-1">
                  <p className="text-2xl font-bold">
                    {formatDate(status.lastHourlyBackup.created)}
                  </p>
                  <Badge variant="secondary">Hourly</Badge>
                </div>
              ) : (
                <p className="text-muted-foreground">Niciun backup</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Ultimul Backup Daily</CardTitle>
            </CardHeader>
            <CardContent>
              {status.lastDailyBackup ? (
                <div className="space-y-1">
                  <p className="text-2xl font-bold">
                    {formatDate(status.lastDailyBackup.created)}
                  </p>
                  <Badge variant="secondary">Daily</Badge>
                </div>
              ) : (
                <p className="text-muted-foreground">Niciun backup</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Backup-uri</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{status.totalBackups}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => createBackup('manual')}
          disabled={creating}
          className="flex items-center gap-2"
        >
          {creating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Database className="w-4 h-4" />
          )}
          Creare Backup Manual
        </Button>

        <Button
          onClick={exportFullDatabase}
          disabled={creating}
          variant="destructive"
          className="flex items-center gap-2"
        >
          {creating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Export Complet Bază de Date
        </Button>

        <Button
          onClick={loadBackups}
          disabled={loading}
          variant="outline"
          className="flex items-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Reîncarcă
        </Button>
      </div>

      {/* Message */}
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Backup Protection Info */}
      <Alert>
        <Shield className="w-4 h-4" />
        <AlertDescription className="ml-2">
          <strong>Protecție Activată:</strong> Backup-uri automat sunt create hourly și daily.
          Toate backup-urile au checksum SHA-256 pentru verificare integritate.
        </AlertDescription>
      </Alert>

      {/* Export Info */}
      <Alert>
        <Download className="w-4 h-4" />
        <AlertDescription className="ml-2">
          <strong>Export Complet:</strong> Butonul "Export Complet Bază de Date" creează și descarcă automat
          un backup complet al tuturor datelor din baza de date într-un singur fișier JSON.
        </AlertDescription>
      </Alert>

      {/* Backups List */}
      <Card>
        <CardHeader>
          <CardTitle>Lista Backup-uri</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Niciun backup disponibil</p>
              <p className="text-sm">Creează primul backup manual</p>
            </div>
          ) : (
            <div className="space-y-3">
              {backups.map((backup) => (
                <div
                  key={backup.filename}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4" />
                      <span className="font-medium">{backup.filename}</span>
                    </div>
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      <span>Dimensiune: {formatSize(backup.size)}</span>
                      <span>Creat: {formatDate(backup.created)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadBackup(backup.path, backup.filename)}
                    >
                      <Download className="w-4 h-4" />
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteBackup(backup.path, backup.filename)}
                      disabled={deleting === backup.filename}
                    >
                      {deleting === backup.filename ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Local Files Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Locație Fișiere Locale</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p className="font-mono bg-muted p-2 rounded">
            backups/database/
          </p>
          <p className="mt-2">
            Backup-urile sunt salvate local în directorul <code>backups/database/</code> al proiectului.
            Poți accesa fișierele direct din sistemul de fișiere sau prin acesta interfață.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}