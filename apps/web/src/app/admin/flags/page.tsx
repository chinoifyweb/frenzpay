'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Flag {
  id: string;
  userId: string;
  email: string | null;
  name: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export default function FlagsPage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/flags', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error();
        setFlags(json.flags ?? []);
      } catch { toast.error('Failed to load flags'); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Fraud flags</h1>
        <p className="text-sm text-muted-foreground">Transactions held or reviewed by the fraud engine.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Recent flags</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Rules</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : flags.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground">No flags recorded.</TableCell></TableRow>
              ) : flags.map((f) => {
                const meta = f.metadata ?? {};
                const score = (meta as { score?: number }).score ?? 0;
                const rules = ((meta as { rules?: Array<{ code: string }> }).rules ?? []).map((r) => r.code);
                const severity = f.action === 'FRAUD_HOLD' ? 'destructive' : 'secondary';
                return (
                  <TableRow key={f.id}>
                    <TableCell>
                      <div className="font-medium">{f.name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{f.email ?? f.userId.slice(0, 8)}</div>
                    </TableCell>
                    <TableCell><Badge variant={severity}>{f.action.replace('FRAUD_', '')}</Badge></TableCell>
                    <TableCell className="font-mono">{score}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{rules.join(', ') || '—'}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {new Date(f.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
