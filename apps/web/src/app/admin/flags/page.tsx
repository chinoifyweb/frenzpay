'use client';

/**
 * /admin/flags
 *
 * Lists every fraud-engine flag (audit_logs rows with action starting with
 * FRAUD_). Each flag can be resolved — resolution creates an append-only
 * admin_audit_logs row which the GET endpoint joins against so the UI shows
 * who resolved what, when, and with what note.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Loader2, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Flag {
  id: string;
  userId: string;
  email: string | null;
  name: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  resolved: boolean;
  resolution: {
    resolvedAt: string;
    resolvedBy: string;
    note: string | null;
  } | null;
}

export default function FlagsPage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);

  // Resolve dialog state — TOTP-gated since flag resolution is
  // compliance-sensitive (clearing a flag without a paper trail would
  // be a hole). Both note (min 10 chars) + a fresh authenticator code
  // are required by the server now.
  const [resolveTarget, setResolveTarget] = useState<Flag | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [resolveTotp, setResolveTotp] = useState('');
  const [resolving, setResolving] = useState(false);

  const fetchFlags = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/flags', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Load failed (${res.status})`);
      setFlags(json.flags ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load flags');
      setFlags([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFlags();
  }, [fetchFlags]);

  async function resolve() {
    if (!resolveTarget) return;
    if (resolveNote.trim().length < 10) {
      toast.error('Note must be at least 10 characters.');
      return;
    }
    if (!/^\d{6}$/.test(resolveTotp)) {
      toast.error('Enter your 6-digit TOTP code.');
      return;
    }
    setResolving(true);
    try {
      const res = await fetch(
        `/api/admin/flags/${encodeURIComponent(resolveTarget.id)}/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            note: resolveNote.trim(),
            totpCode: resolveTotp,
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Resolve failed (${res.status})`);
      toast.success('Flag resolved');
      setResolveTarget(null);
      setResolveNote('');
      setResolveTotp('');
      await fetchFlags();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resolve failed');
      setResolveTotp(''); // TOTP rotates every 30s — clear stale entry
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Fraud flags</h1>
        <p className="text-sm text-muted-foreground">
          Transactions held or reviewed by the fraud engine. Resolve once investigated —
          resolution is append-only and auditable.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Recent flags
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Rules</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                    Loading…
                  </TableCell>
                </TableRow>
              ) : flags.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    No flags recorded.
                  </TableCell>
                </TableRow>
              ) : (
                flags.map((f) => {
                  const meta = (f.metadata ?? {}) as {
                    score?: number;
                    rules?: Array<{ code: string }>;
                  };
                  const score = meta.score ?? 0;
                  const rules = (meta.rules ?? []).map((r) => r.code);
                  const severity = f.action === 'FRAUD_HOLD' ? 'destructive' : 'secondary';
                  return (
                    <TableRow
                      key={f.id}
                      className={f.resolved ? 'opacity-60' : ''}
                    >
                      <TableCell>
                        <div className="font-medium">{f.name ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">
                          {f.email ?? f.userId?.slice(0, 8) ?? '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={severity}>{f.action.replace('FRAUD_', '')}</Badge>
                      </TableCell>
                      <TableCell className="font-mono">{score}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {rules.join(', ') || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(f.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {f.resolved ? (
                          <div className="inline-flex flex-col items-end gap-0.5">
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                              <ShieldCheck className="h-3 w-3 mr-1" />
                              Resolved
                            </Badge>
                            {f.resolution && (
                              <span className="text-[10px] text-muted-foreground">
                                by {f.resolution.resolvedBy}
                              </span>
                            )}
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setResolveTarget(f);
                              setResolveNote('');
                              setResolveTotp('');
                            }}
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Resolve
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Resolve dialog */}
      <Dialog
        open={!!resolveTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResolveTarget(null);
            setResolveNote('');
            setResolveTotp('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve fraud flag</DialogTitle>
            <DialogDescription>
              Mark this flag as reviewed. The resolution is recorded in the admin audit log —
              it can&apos;t be edited or undone, only superseded by a new resolution entry.
            </DialogDescription>
          </DialogHeader>

          {resolveTarget && (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
                <p>
                  <span className="text-muted-foreground">User:</span>{' '}
                  <span className="font-medium">{resolveTarget.name ?? resolveTarget.email ?? '—'}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Flag:</span>{' '}
                  <Badge variant="outline" className="text-[10px]">
                    {resolveTarget.action}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(resolveTarget.createdAt).toLocaleString()}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="note">Resolution note (min 10 chars)</Label>
                <Textarea
                  id="note"
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  rows={3}
                  disabled={resolving}
                />
                <p className="text-xs text-muted-foreground">
                  Required. Briefly explain why this flag is being cleared — it&apos;s recorded in the admin audit log.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="resolve-totp">Your 6-digit TOTP code</Label>
                <Input
                  id="resolve-totp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={resolveTotp}
                  onChange={(e) => setResolveTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="font-mono tracking-widest text-center"
                  disabled={resolving}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResolveTarget(null)}
              disabled={resolving}
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={resolving || resolveNote.trim().length < 10 || !/^\d{6}$/.test(resolveTotp)}
              onClick={resolve}
            >
              {resolving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Mark resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
