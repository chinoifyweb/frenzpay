'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Check,
  X,
  Eye,
  ShieldCheck,
  FileText,
  Camera,
} from 'lucide-react'
import { formatDate, formatDateTime } from '@/lib/utils'
import type { KYCRecord, KYCStatus } from '@/types'

interface KYCRecordWithUser extends KYCRecord {
  user_name: string
  user_email: string
}

const mockKYCRecords: KYCRecordWithUser[] = [
  { id: 'kyc_001', user_id: 'u_003', bvn: '22100000001', id_type: 'nin', id_number: '12345678901', id_document_url: '/placeholder-id.png', selfie_url: '/placeholder-selfie.png', status: 'pending', reviewed_by: null, rejection_reason: null, submitted_at: '2026-03-13T09:00:00Z', reviewed_at: null, user_name: 'Emeka Nwosu', user_email: 'emeka.nwosu@outlook.com' },
  { id: 'kyc_002', user_id: 'u_009', bvn: '22100000002', id_type: 'passport', id_number: 'A08765432', id_document_url: '/placeholder-id.png', selfie_url: '/placeholder-selfie.png', status: 'pending', reviewed_by: null, rejection_reason: null, submitted_at: '2026-03-13T11:30:00Z', reviewed_at: null, user_name: 'Aisha Yusuf', user_email: 'aisha.yusuf@gmail.com' },
  { id: 'kyc_003', user_id: 'u_014', bvn: '22100000003', id_type: 'drivers_license', id_number: 'DL-2024-87654', id_document_url: '/placeholder-id.png', selfie_url: '/placeholder-selfie.png', status: 'pending', reviewed_by: null, rejection_reason: null, submitted_at: '2026-03-12T15:20:00Z', reviewed_at: null, user_name: 'Blessing Nnamdi', user_email: 'blessing.nnamdi@hotmail.com' },
  { id: 'kyc_004', user_id: 'u_017', bvn: '22100000004', id_type: 'voters_card', id_number: 'VC-98765-AB', id_document_url: '/placeholder-id.png', selfie_url: '/placeholder-selfie.png', status: 'pending', reviewed_by: null, rejection_reason: null, submitted_at: '2026-03-12T08:45:00Z', reviewed_at: null, user_name: 'Tola Adeniyi', user_email: 'tola.adeniyi@gmail.com' },
  { id: 'kyc_005', user_id: 'u_018', bvn: '22100000005', id_type: 'nin', id_number: '98765432101', id_document_url: '/placeholder-id.png', selfie_url: '/placeholder-selfie.png', status: 'pending', reviewed_by: null, rejection_reason: null, submitted_at: '2026-03-11T14:00:00Z', reviewed_at: null, user_name: 'Chidi Amadi', user_email: 'chidi.amadi@yahoo.com' },
  { id: 'kyc_006', user_id: 'u_001', bvn: '22100000006', id_type: 'passport', id_number: 'B12345678', id_document_url: '/placeholder-id.png', selfie_url: '/placeholder-selfie.png', status: 'verified', reviewed_by: 'u_007', rejection_reason: null, submitted_at: '2025-08-16T10:00:00Z', reviewed_at: '2025-08-17T09:00:00Z', user_name: 'Adebayo Johnson', user_email: 'adebayo.johnson@gmail.com' },
  { id: 'kyc_007', user_id: 'u_002', bvn: '22100000007', id_type: 'nin', id_number: '11223344556', id_document_url: '/placeholder-id.png', selfie_url: '/placeholder-selfie.png', status: 'verified', reviewed_by: 'u_007', rejection_reason: null, submitted_at: '2025-09-03T14:30:00Z', reviewed_at: '2025-09-04T10:00:00Z', user_name: 'Chioma Okafor', user_email: 'chioma.okafor@yahoo.com' },
  { id: 'kyc_008', user_id: 'u_004', bvn: '22100000008', id_type: 'drivers_license', id_number: 'DL-2023-11111', id_document_url: '/placeholder-id.png', selfie_url: '/placeholder-selfie.png', status: 'verified', reviewed_by: 'u_016', rejection_reason: null, submitted_at: '2025-11-06T16:00:00Z', reviewed_at: '2025-11-07T11:00:00Z', user_name: 'Fatima Bello', user_email: 'fatima.bello@gmail.com' },
  { id: 'kyc_009', user_id: 'u_005', bvn: '22100000009', id_type: 'nin', id_number: '99887766554', id_document_url: '/placeholder-id.png', selfie_url: '/placeholder-selfie.png', status: 'rejected', reviewed_by: 'u_007', rejection_reason: 'ID document is blurry and unreadable. Please resubmit with a clearer photo.', submitted_at: '2025-12-02T11:30:00Z', reviewed_at: '2025-12-03T14:00:00Z', user_name: 'Oluwaseun Ade', user_email: 'oluwaseun.ade@gmail.com' },
  { id: 'kyc_010', user_id: 'u_019', bvn: '22100000010', id_type: 'passport', id_number: 'C99887766', id_document_url: '/placeholder-id.png', selfie_url: '/placeholder-selfie.png', status: 'rejected', reviewed_by: 'u_016', rejection_reason: 'Selfie does not match the ID document photo. Please ensure it is the same person.', submitted_at: '2026-02-10T13:00:00Z', reviewed_at: '2026-02-11T09:30:00Z', user_name: 'Funke Alabi', user_email: 'funke.alabi@outlook.com' },
  { id: 'kyc_011', user_id: 'u_020', bvn: '22100000011', id_type: 'voters_card', id_number: 'VC-55443-CD', id_document_url: '/placeholder-id.png', selfie_url: '/placeholder-selfie.png', status: 'pending', reviewed_by: null, rejection_reason: null, submitted_at: '2026-03-14T06:15:00Z', reviewed_at: null, user_name: 'Obinna Eze', user_email: 'obinna.eze@gmail.com' },
]

const statusColors: Record<KYCStatus, string> = {
  verified: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  not_started: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const idTypeLabels: Record<string, string> = {
  passport: 'International Passport',
  nin: 'NIN',
  drivers_license: "Driver's License",
  voters_card: "Voter's Card",
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function maskBVN(bvn: string) {
  return '****' + bvn.slice(-4)
}

export default function KYCPage() {
  const [selectedRecord, setSelectedRecord] = useState<KYCRecordWithUser | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)

  const pending = mockKYCRecords.filter((r) => r.status === 'pending')
  const verified = mockKYCRecords.filter((r) => r.status === 'verified')
  const rejected = mockKYCRecords.filter((r) => r.status === 'rejected')

  function KYCTable({ records }: { records: KYCRecordWithUser[] }) {
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="hidden md:table-cell">Submitted</TableHead>
              <TableHead>ID Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  No records in this category.
                </TableCell>
              </TableRow>
            ) : (
              records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-muted">
                          {getInitials(record.user_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm">{record.user_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {record.user_email}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {formatDate(record.submitted_at)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {idTypeLabels[record.id_type] || record.id_type}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[record.status]}>
                      {record.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedRecord(record)
                        setShowRejectForm(false)
                        setRejectionReason('')
                      }}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">KYC Verification Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and process identity verification applications.
        </p>
      </div>

      {/* Tabs */}
      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="pending">
            <div className="border-b px-4 pt-3">
              <TabsList variant="line">
                <TabsTrigger value="pending">
                  Pending
                  {pending.length > 0 && (
                    <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-600 px-1.5 text-[10px] font-bold text-white">
                      {pending.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="verified">
                  Verified
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    ({verified.length})
                  </span>
                </TabsTrigger>
                <TabsTrigger value="rejected">
                  Rejected
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    ({rejected.length})
                  </span>
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="pending">
              <KYCTable records={pending} />
            </TabsContent>
            <TabsContent value="verified">
              <KYCTable records={verified} />
            </TabsContent>
            <TabsContent value="rejected">
              <KYCTable records={rejected} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog
        open={!!selectedRecord}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRecord(null)
            setShowRejectForm(false)
            setRejectionReason('')
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>KYC Review</DialogTitle>
            <DialogDescription>
              Review the submitted identity verification documents.
            </DialogDescription>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-5">
              {/* User Info */}
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="text-sm bg-muted">
                    {getInitials(selectedRecord.user_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold">{selectedRecord.user_name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedRecord.user_email}
                  </p>
                </div>
                <Badge className={`ml-auto ${statusColors[selectedRecord.status]}`}>
                  {selectedRecord.status}
                </Badge>
              </div>

              <Separator />

              {/* Verification Details */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">BVN</p>
                  <p className="font-mono font-medium">{maskBVN(selectedRecord.bvn)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">ID Type</p>
                  <p className="font-medium">
                    {idTypeLabels[selectedRecord.id_type] || selectedRecord.id_type}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">ID Number</p>
                  <p className="font-mono font-medium">{selectedRecord.id_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Submitted</p>
                  <p className="font-medium">
                    {formatDateTime(selectedRecord.submitted_at)}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Document Preview Areas */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <FileText className="h-4 w-4" />
                    ID Document
                  </p>
                  <div className="flex h-36 items-center justify-center rounded-lg border-2 border-dashed bg-muted/50">
                    <div className="text-center">
                      <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
                      <p className="text-xs text-muted-foreground mt-1">
                        Document preview
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <Camera className="h-4 w-4" />
                    Selfie
                  </p>
                  <div className="flex h-36 items-center justify-center rounded-lg border-2 border-dashed bg-muted/50">
                    <div className="text-center">
                      <Camera className="h-8 w-8 mx-auto text-muted-foreground" />
                      <p className="text-xs text-muted-foreground mt-1">
                        Selfie preview
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rejection Reason (for already rejected) */}
              {selectedRecord.status === 'rejected' && selectedRecord.rejection_reason && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-900/10">
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">
                    Rejection Reason
                  </p>
                  <p className="text-sm text-red-600 dark:text-red-300 mt-1">
                    {selectedRecord.rejection_reason}
                  </p>
                </div>
              )}

              {/* Actions (only for pending) */}
              {selectedRecord.status === 'pending' && (
                <>
                  {showRejectForm ? (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-red-600">
                        Provide rejection reason:
                      </p>
                      <Textarea
                        placeholder="Explain why this KYC application is being rejected..."
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="flex-1"
                          disabled={rejectionReason.trim().length === 0}
                          onClick={() => {
                            setSelectedRecord(null)
                            setShowRejectForm(false)
                            setRejectionReason('')
                          }}
                        >
                          Confirm Rejection
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowRejectForm(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <DialogFooter className="gap-2 sm:gap-0">
                      <Button
                        className="bg-green-600 hover:bg-green-700 text-white flex-1"
                        onClick={() => setSelectedRecord(null)}
                      >
                        <Check className="h-4 w-4 mr-1.5" />
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={() => setShowRejectForm(true)}
                      >
                        <X className="h-4 w-4 mr-1.5" />
                        Reject
                      </Button>
                    </DialogFooter>
                  )}
                </>
              )}

              {selectedRecord.status !== 'pending' && (
                <DialogFooter>
                  <DialogClose
                    render={
                      <Button variant="outline" className="w-full">
                        Close
                      </Button>
                    }
                  />
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
