'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  Search,
  MoreHorizontal,
  Eye,
  ShieldCheck,
  UserX,
  UserCheck,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { User, KYCStatus, UserRole } from '@/types'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'

const mockUsers: User[] = [
  { id: 'u_001', email: 'adebayo.johnson@gmail.com', phone: '+2348012345678', full_name: 'Adebayo Johnson', avatar_url: null, role: 'user', is_verified: true, is_active: true, kyc_status: 'verified', two_factor_enabled: true, referral_code: 'FRZABD12', referred_by: null, created_at: '2025-08-15T10:00:00Z', updated_at: '2026-03-14T10:00:00Z' },
  { id: 'u_002', email: 'chioma.okafor@yahoo.com', phone: '+2348023456789', full_name: 'Chioma Okafor', avatar_url: null, role: 'user', is_verified: true, is_active: true, kyc_status: 'verified', two_factor_enabled: false, referral_code: 'FRZCHO34', referred_by: 'u_001', created_at: '2025-09-02T14:30:00Z', updated_at: '2026-03-10T08:00:00Z' },
  { id: 'u_003', email: 'emeka.nwosu@outlook.com', phone: '+2348034567890', full_name: 'Emeka Nwosu', avatar_url: null, role: 'user', is_verified: true, is_active: true, kyc_status: 'pending', two_factor_enabled: false, referral_code: 'FRZEME56', referred_by: null, created_at: '2025-10-20T09:15:00Z', updated_at: '2026-03-13T12:00:00Z' },
  { id: 'u_004', email: 'fatima.bello@gmail.com', phone: '+2348045678901', full_name: 'Fatima Bello', avatar_url: null, role: 'user', is_verified: true, is_active: true, kyc_status: 'verified', two_factor_enabled: true, referral_code: 'FRZFAT78', referred_by: 'u_001', created_at: '2025-11-05T16:00:00Z', updated_at: '2026-03-12T15:00:00Z' },
  { id: 'u_005', email: 'oluwaseun.ade@gmail.com', phone: '+2348056789012', full_name: 'Oluwaseun Ade', avatar_url: null, role: 'user', is_verified: false, is_active: false, kyc_status: 'rejected', two_factor_enabled: false, referral_code: 'FRZOLU90', referred_by: null, created_at: '2025-12-01T11:30:00Z', updated_at: '2026-02-28T09:00:00Z' },
  { id: 'u_006', email: 'ibrahim.musa@hotmail.com', phone: '+2348067890123', full_name: 'Ibrahim Musa', avatar_url: null, role: 'user', is_verified: true, is_active: true, kyc_status: 'verified', two_factor_enabled: false, referral_code: 'FRZIBR12', referred_by: 'u_002', created_at: '2025-12-15T08:45:00Z', updated_at: '2026-03-14T07:00:00Z' },
  { id: 'u_007', email: 'ngozi.eze@gmail.com', phone: '+2348078901234', full_name: 'Ngozi Eze', avatar_url: null, role: 'admin', is_verified: true, is_active: true, kyc_status: 'verified', two_factor_enabled: true, referral_code: 'FRZNGO34', referred_by: null, created_at: '2025-06-01T10:00:00Z', updated_at: '2026-03-14T10:00:00Z' },
  { id: 'u_008', email: 'david.obi@yahoo.com', phone: '+2348089012345', full_name: 'David Obi', avatar_url: null, role: 'user', is_verified: true, is_active: true, kyc_status: 'not_started', two_factor_enabled: false, referral_code: 'FRZDAV56', referred_by: null, created_at: '2026-01-10T13:20:00Z', updated_at: '2026-03-11T14:00:00Z' },
  { id: 'u_009', email: 'aisha.yusuf@gmail.com', phone: '+2348090123456', full_name: 'Aisha Yusuf', avatar_url: null, role: 'user', is_verified: true, is_active: true, kyc_status: 'pending', two_factor_enabled: false, referral_code: 'FRZAIS78', referred_by: 'u_004', created_at: '2026-01-25T07:00:00Z', updated_at: '2026-03-13T16:00:00Z' },
  { id: 'u_010', email: 'kemi.adeyemi@outlook.com', phone: '+2348001234567', full_name: 'Kemi Adeyemi', avatar_url: null, role: 'user', is_verified: true, is_active: true, kyc_status: 'verified', two_factor_enabled: true, referral_code: 'FRZKEM90', referred_by: null, created_at: '2026-02-05T15:45:00Z', updated_at: '2026-03-14T09:00:00Z' },
  { id: 'u_011', email: 'tunde.bakare@gmail.com', phone: '+2348011122233', full_name: 'Tunde Bakare', avatar_url: null, role: 'user', is_verified: true, is_active: false, kyc_status: 'verified', two_factor_enabled: false, referral_code: 'FRZTUN12', referred_by: null, created_at: '2026-02-14T10:10:00Z', updated_at: '2026-03-08T11:00:00Z' },
  { id: 'u_012', email: 'grace.udo@yahoo.com', phone: '+2348022233344', full_name: 'Grace Udo', avatar_url: null, role: 'user', is_verified: true, is_active: true, kyc_status: 'verified', two_factor_enabled: false, referral_code: 'FRZGRA34', referred_by: 'u_006', created_at: '2026-02-20T09:30:00Z', updated_at: '2026-03-13T18:00:00Z' },
  { id: 'u_013', email: 'samuel.okonkwo@gmail.com', phone: '+2348033344455', full_name: 'Samuel Okonkwo', avatar_url: null, role: 'user', is_verified: false, is_active: true, kyc_status: 'not_started', two_factor_enabled: false, referral_code: 'FRZSAM56', referred_by: null, created_at: '2026-03-01T12:00:00Z', updated_at: '2026-03-14T06:00:00Z' },
  { id: 'u_014', email: 'blessing.nnamdi@hotmail.com', phone: '+2348044455566', full_name: 'Blessing Nnamdi', avatar_url: null, role: 'user', is_verified: true, is_active: true, kyc_status: 'pending', two_factor_enabled: false, referral_code: 'FRZBLE78', referred_by: 'u_010', created_at: '2026-03-05T14:15:00Z', updated_at: '2026-03-14T08:00:00Z' },
  { id: 'u_015', email: 'yemi.alade@gmail.com', phone: '+2348055566677', full_name: 'Yemi Alade', avatar_url: null, role: 'user', is_verified: true, is_active: true, kyc_status: 'verified', two_factor_enabled: true, referral_code: 'FRZYEM90', referred_by: null, created_at: '2026-03-08T16:30:00Z', updated_at: '2026-03-14T10:00:00Z' },
  { id: 'u_016', email: 'admin@frenz.ng', phone: '+2348000000001', full_name: 'Super Admin', avatar_url: null, role: 'admin', is_verified: true, is_active: true, kyc_status: 'verified', two_factor_enabled: true, referral_code: 'FRZADM00', referred_by: null, created_at: '2025-01-01T00:00:00Z', updated_at: '2026-03-14T10:00:00Z' },
]

const kycStatusColors: Record<KYCStatus, string> = {
  verified: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  not_started: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const roleColors: Record<UserRole, string> = {
  admin: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  user: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function UsersPage() {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [kycFilter, setKycFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [page, setPage] = useState(1)
  const perPage = 10

  const filtered = mockUsers.filter((user) => {
    const matchesSearch =
      search === '' ||
      user.full_name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      (user.phone && user.phone.includes(search))
    const matchesRole = roleFilter === 'all' || user.role === roleFilter
    const matchesKyc = kycFilter === 'all' || user.kyc_status === kycFilter
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && user.is_active) ||
      (statusFilter === 'suspended' && !user.is_active)
    return matchesSearch && matchesRole && matchesKyc && matchesStatus
  })

  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">User Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage all platform users, their accounts and permissions.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or phone..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v as string); setPage(1) }}>
                <SelectTrigger className="w-[110px]">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Select value={kycFilter} onValueChange={(v) => { setKycFilter(v as string); setPage(1) }}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="KYC" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All KYC</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="not_started">Not Started</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as string); setPage(1) }}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="hidden md:table-cell">Phone</TableHead>
                  <TableHead>KYC</TableHead>
                  <TableHead className="hidden sm:table-cell">Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Joined</TableHead>
                  <TableHead className="w-12">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      No users found matching your criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((user) => (
                    <TableRow
                      key={user.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedUser(user)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-muted">
                              {getInitials(user.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-sm">{user.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.email}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {user.phone || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={kycStatusColors[user.kyc_status]}>
                          {user.kyc_status === 'not_started' ? 'Not Started' : user.kyc_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge className={roleColors[user.role]}>{user.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            user.is_active
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }
                        >
                          {user.is_active ? 'Active' : 'Suspended'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {formatDate(user.created_at)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted outline-none"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedUser(user)
                              }}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer">
                              {user.is_active ? (
                                <>
                                  <UserX className="h-4 w-4 mr-2" />
                                  Suspend
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-4 w-4 mr-2" />
                                  Activate
                                </>
                              )}
                            </DropdownMenuItem>
                            {user.role !== 'admin' && (
                              <DropdownMenuItem className="cursor-pointer">
                                <ShieldCheck className="h-4 w-4 mr-2" />
                                Make Admin
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * perPage + 1}–
                {Math.min(page * perPage, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page === totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Detail Dialog */}
      <Dialog
        open={!!selectedUser}
        onOpenChange={(open) => { if (!open) setSelectedUser(null) }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>
              View detailed information about this user.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-6">
              {/* User header */}
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14">
                  <AvatarFallback className="text-lg bg-muted">
                    {getInitials(selectedUser.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-lg font-semibold">{selectedUser.full_name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge className={roleColors[selectedUser.role]}>
                      {selectedUser.role}
                    </Badge>
                    <Badge className={kycStatusColors[selectedUser.kyc_status]}>
                      {selectedUser.kyc_status === 'not_started' ? 'No KYC' : selectedUser.kyc_status}
                    </Badge>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Phone</p>
                  <p className="font-medium">{selectedUser.phone || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium">
                    {selectedUser.is_active ? 'Active' : 'Suspended'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Email Verified</p>
                  <p className="font-medium">
                    {selectedUser.is_verified ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">2FA Enabled</p>
                  <p className="font-medium">
                    {selectedUser.two_factor_enabled ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Referral Code</p>
                  <p className="font-mono font-medium">{selectedUser.referral_code}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Joined</p>
                  <p className="font-medium">{formatDate(selectedUser.created_at)}</p>
                </div>
              </div>

              <Separator />

              {/* Wallets placeholder */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Wallets</h4>
                <div className="grid grid-cols-3 gap-2">
                  {['USD', 'GBP', 'EUR'].map((c) => (
                    <div
                      key={c}
                      className="rounded-lg border p-3 text-center"
                    >
                      <p className="text-xs text-muted-foreground">{c}</p>
                      <p className="text-sm font-bold mt-0.5">
                        {formatCurrency(
                          Math.random() * 5000,
                          c
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant={selectedUser.is_active ? 'destructive' : 'default'}
                  size="sm"
                  className="flex-1"
                >
                  {selectedUser.is_active ? 'Suspend User' : 'Activate User'}
                </Button>
                <DialogClose
                  render={
                    <Button variant="outline" size="sm" className="flex-1">
                      Close
                    </Button>
                  }
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
