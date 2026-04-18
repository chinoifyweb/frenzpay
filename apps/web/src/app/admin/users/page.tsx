'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

interface UserRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  kycTier: string;
  kycStatus: string;
  createdAt: string;
  frenzTag: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400',
  PENDING_KYC: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-400',
  FROZEN: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-400',
  SUSPENDED: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400',
  DELETED: 'bg-muted text-muted-foreground',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const [tier, setTier] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (q) params.set('q', q);
      if (status !== 'ALL') params.set('status', status);
      if (tier !== 'ALL') params.set('tier', tier);
      const res = await fetch(`/api/admin/users?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error();
      setUsers(json.users ?? []);
      setPages(json.pagination.pages ?? 1);
    } catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  }, [q, status, tier, page]);

  useEffect(() => { void fetchUsers(); }, [fetchUsers]);
  useEffect(() => { setPage(1); }, [q, status, tier]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Users</h1>
        <p className="text-sm text-muted-foreground">Search, filter, and inspect user accounts.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center md:justify-between md:gap-4">
          <CardTitle className="text-base">Search</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-9 w-[240px] pl-9" placeholder="Email..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={status} onValueChange={(v) => { if (v) setStatus(v); }}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="PENDING_KYC">Pending KYC</SelectItem>
                <SelectItem value="FROZEN">Frozen</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tier} onValueChange={(v) => { if (v) setTier(v); }}>
              <SelectTrigger className="h-9 w-[120px]"><SelectValue placeholder="Tier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All tiers</SelectItem>
                <SelectItem value="T0">T0</SelectItem>
                <SelectItem value="T1">T1</SelectItem>
                <SelectItem value="T2">T2</SelectItem>
                <SelectItem value="T3">T3</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>FrenzTag</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>KYC</TableHead>
                <TableHead className="text-right">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">Loading...</TableCell></TableRow>
              ) : users.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">No users found.</TableCell></TableRow>
              ) : users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell>{u.frenzTag ? <span className="font-mono text-xs">@{u.frenzTag}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell><Badge variant="secondary">{u.kycTier}</Badge></TableCell>
                  <TableCell><Badge variant="secondary" className={STATUS_STYLES[u.status] ?? ''}>{u.status}</Badge></TableCell>
                  <TableCell><span className="text-xs text-muted-foreground">{u.kycStatus}</span></TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
          <Button size="sm" variant="outline" disabled={page === 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Previous
          </Button>
          <Button size="sm" variant="outline" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
