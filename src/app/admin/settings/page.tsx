'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Settings, DollarSign, Shield, Server, Copy } from 'lucide-react'
import { toast } from 'sonner'

const mockAuditLogs = [
  { id: '1', admin: 'Admin User', action: 'Approved KYC', resource: 'Adekunle Johnson', created_at: '2026-03-14T10:30:00Z' },
  { id: '2', admin: 'Admin User', action: 'Updated fee settings', resource: 'Platform Settings', created_at: '2026-03-14T09:15:00Z' },
  { id: '3', admin: 'Admin User', action: 'Approved withdrawal', resource: 'WDR-001 ($1,000)', created_at: '2026-03-13T16:45:00Z' },
  { id: '4', admin: 'Admin User', action: 'Rejected KYC', resource: 'Tunde Bakare', created_at: '2026-03-13T14:20:00Z' },
  { id: '5', admin: 'Admin User', action: 'Suspended user', resource: 'test@spam.com', created_at: '2026-03-12T11:00:00Z' },
  { id: '6', admin: 'Admin User', action: 'Updated announcement', resource: 'Platform Settings', created_at: '2026-03-12T09:30:00Z' },
  { id: '7', admin: 'Admin User', action: 'Completed withdrawal', resource: 'WDR-006 ($1,200)', created_at: '2026-03-11T15:30:00Z' },
  { id: '8', admin: 'Admin User', action: 'Approved KYC', resource: 'Grace Adeyemi', created_at: '2026-03-11T12:00:00Z' },
  { id: '9', admin: 'Admin User', action: 'Created admin user', resource: 'newadmin@frenz.ng', created_at: '2026-03-10T10:00:00Z' },
  { id: '10', admin: 'Admin User', action: 'Updated compliance settings', resource: 'Platform Settings', created_at: '2026-03-09T14:00:00Z' },
]

export default function AdminSettingsPage() {
  const [platformName, setPlatformName] = useState('Frenz Pay')
  const [supportEmail, setSupportEmail] = useState('support@frenz.ng')
  const [announcement, setAnnouncement] = useState('')
  const [maintenanceMode, setMaintenanceMode] = useState(false)

  const [withdrawalFee, setWithdrawalFee] = useState('1.5')
  const [fxSpread, setFxSpread] = useState('0.5')
  const [minWithdrawal, setMinWithdrawal] = useState('10')
  const [trc20Fee, setTrc20Fee] = useState('1.00')
  const [erc20Fee, setErc20Fee] = useState('5.00')

  const [dailyLimit, setDailyLimit] = useState('50000')
  const [monthlyLimit, setMonthlyLimit] = useState('500000')
  const [kycRequired, setKycRequired] = useState(true)
  const [amlThreshold, setAmlThreshold] = useState('10000')

  const handleSave = (section: string) => {
    toast.success(`${section} settings saved successfully`)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform Settings</h1>
        <p className="text-muted-foreground">Configure platform-wide settings and parameters</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general" className="gap-1.5"><Settings className="h-4 w-4" /> General</TabsTrigger>
          <TabsTrigger value="fees" className="gap-1.5"><DollarSign className="h-4 w-4" /> Fees</TabsTrigger>
          <TabsTrigger value="compliance" className="gap-1.5"><Shield className="h-4 w-4" /> Compliance</TabsTrigger>
          <TabsTrigger value="system" className="gap-1.5"><Server className="h-4 w-4" /> System</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Configure basic platform settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="platformName">Platform Name</Label>
                  <Input id="platformName" value={platformName} onChange={e => setPlatformName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supportEmail">Support Email</Label>
                  <Input id="supportEmail" type="email" value={supportEmail} onChange={e => setSupportEmail(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="announcement">Announcement Banner</Label>
                <Textarea id="announcement" placeholder="Enter announcement text (leave empty to hide)" value={announcement} onChange={e => setAnnouncement(e.target.value)} rows={3} />
                <p className="text-xs text-muted-foreground">Displayed at the top of all pages when set</p>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Maintenance Mode</p>
                  <p className="text-sm text-muted-foreground">Users will see a maintenance page when enabled</p>
                </div>
                <Switch checked={maintenanceMode} onCheckedChange={setMaintenanceMode} />
              </div>
              {maintenanceMode && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800 font-medium">Warning: Maintenance mode is ON</p>
                </div>
              )}
              <Button onClick={() => handleSave('General')}>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fees">
          <Card>
            <CardHeader>
              <CardTitle>Fee Configuration</CardTitle>
              <CardDescription>Set withdrawal fees, FX spreads, and network fees</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Withdrawal Fee (%)</Label>
                  <Input type="number" step="0.1" value={withdrawalFee} onChange={e => setWithdrawalFee(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>FX Spread (%)</Label>
                  <Input type="number" step="0.1" value={fxSpread} onChange={e => setFxSpread(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Minimum Withdrawal (USD)</Label>
                  <Input type="number" value={minWithdrawal} onChange={e => setMinWithdrawal(e.target.value)} />
                </div>
              </div>
              <Separator />
              <h3 className="font-medium">Network Fees</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>TRC-20 Fee (USD)</Label>
                  <Input type="number" step="0.01" value={trc20Fee} onChange={e => setTrc20Fee(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>ERC-20 Fee (USD)</Label>
                  <Input type="number" step="0.01" value={erc20Fee} onChange={e => setErc20Fee(e.target.value)} />
                </div>
              </div>
              <Button onClick={() => handleSave('Fee')}>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance">
          <Card>
            <CardHeader>
              <CardTitle>Compliance Settings</CardTitle>
              <CardDescription>KYC requirements and transaction limits</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">KYC Required for Withdrawals</p>
                  <p className="text-sm text-muted-foreground">Users must verify identity before withdrawing</p>
                </div>
                <Switch checked={kycRequired} onCheckedChange={setKycRequired} />
              </div>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Daily Withdrawal Limit (USD)</Label>
                  <Input type="number" value={dailyLimit} onChange={e => setDailyLimit(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Monthly Withdrawal Limit (USD)</Label>
                  <Input type="number" value={monthlyLimit} onChange={e => setMonthlyLimit(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>AML Alert Threshold (USD)</Label>
                  <Input type="number" value={amlThreshold} onChange={e => setAmlThreshold(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Transactions above this trigger a review</p>
                </div>
              </div>
              <Button onClick={() => handleSave('Compliance')}>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>API Configuration</CardTitle>
                <CardDescription>API endpoints and webhook URLs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>API Base URL</Label>
                  <div className="flex gap-2">
                    <Input value="https://frenz.ng/api" readOnly className="font-mono text-sm bg-muted" />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard('https://frenz.ng/api')}><Copy className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Webhook URL</Label>
                  <div className="flex gap-2">
                    <Input value="https://frenz.ng/api/webhooks" readOnly className="font-mono text-sm bg-muted" />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard('https://frenz.ng/api/webhooks')}><Copy className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Supabase Project</Label>
                  <div className="flex gap-2 items-center">
                    <Input value="https://******.supabase.co" readOnly className="font-mono text-sm bg-muted" />
                    <Badge variant="secondary">Masked</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Audit Log</CardTitle>
                <CardDescription>Recent administrative actions</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Resource</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockAuditLogs.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                        <TableCell className="font-medium text-sm">{log.admin}</TableCell>
                        <TableCell className="text-sm">{log.action}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{log.resource}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
