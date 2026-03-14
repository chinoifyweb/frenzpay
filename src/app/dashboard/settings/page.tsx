'use client'

import { useState } from 'react'
import {
  User,
  Shield,
  Bell,
  ShieldCheck,
  Camera,
  Upload,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import type { KYCStatus } from '@/types'
import { formatDate, cn } from '@/lib/utils'
import { KYC_ID_TYPES } from '@/lib/constants'
import { toast } from 'sonner'

// Mock user profile data
const mockProfile = {
  full_name: 'Adekunle Johnson',
  email: 'adekunle@example.com',
  phone: '+234 801 234 5678',
  avatar_url: null as string | null,
}

// Mock sessions
const mockSessions = [
  {
    id: '1',
    device: 'Chrome on Windows',
    ip: '102.89.23.xxx',
    lastActive: '2026-03-14T10:30:00Z',
    isCurrent: true,
  },
  {
    id: '2',
    device: 'Frenz Pay Mobile App (iOS)',
    ip: '102.89.45.xxx',
    lastActive: '2026-03-13T18:15:00Z',
    isCurrent: false,
  },
]

// Mock notification preferences
const defaultNotifications = {
  payment_received: true,
  withdrawal_complete: true,
  security_alerts: true,
  product_updates: false,
}

const notificationOptions = [
  {
    key: 'payment_received',
    label: 'Payment Received',
    description: 'Get notified when a payment is credited to your wallet',
  },
  {
    key: 'withdrawal_complete',
    label: 'Withdrawal Complete',
    description: 'Get notified when your USDT withdrawal is processed',
  },
  {
    key: 'security_alerts',
    label: 'Security Alerts',
    description: 'Get notified about login attempts and security events',
  },
  {
    key: 'product_updates',
    label: 'Product Updates',
    description: 'Receive news about new features and improvements',
  },
]

export default function SettingsPage() {
  // Profile state
  const [fullName, setFullName] = useState(mockProfile.full_name)
  const [phone, setPhone] = useState(mockProfile.phone)
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  // Security state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)

  // Notification state
  const [notifications, setNotifications] = useState(defaultNotifications)

  // KYC state
  const [kycStatus] = useState<KYCStatus>('not_started')
  const [kycStep, setKycStep] = useState(1)
  const [bvn, setBvn] = useState('')
  const [idType, setIdType] = useState('')

  const handleSaveProfile = () => {
    setIsSavingProfile(true)
    setTimeout(() => {
      setIsSavingProfile(false)
      toast.success('Profile updated successfully')
    }, 1000)
  }

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setIsChangingPassword(true)
    setTimeout(() => {
      setIsChangingPassword(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success('Password changed successfully')
    }, 1000)
  }

  const handleToggleNotification = (key: string, checked: boolean) => {
    setNotifications((prev) => ({ ...prev, [key]: checked }))
    toast.success('Notification preference updated')
  }

  const handleToggle2FA = (checked: boolean) => {
    setTwoFactorEnabled(checked)
    toast.success(
      checked
        ? 'Two-factor authentication enabled'
        : 'Two-factor authentication disabled'
    )
  }

  const handleRevokeSession = (sessionId: string) => {
    toast.success('Session revoked successfully')
  }

  const kycStatusVariant: Record<KYCStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    not_started: 'outline',
    pending: 'secondary',
    verified: 'default',
    rejected: 'destructive',
  }

  const kycStatusLabel: Record<KYCStatus, string> = {
    not_started: 'Not Started',
    pending: 'Pending Review',
    verified: 'Verified',
    rejected: 'Rejected',
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile" className="gap-1.5">
            <User className="size-4" />
            <span className="hidden sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5">
            <Shield className="size-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="size-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="kyc" className="gap-1.5">
            <ShieldCheck className="size-4" />
            <span className="hidden sm:inline">KYC</span>
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <p className="text-sm text-muted-foreground">
                Update your personal information and profile photo
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar Upload */}
              <div className="flex items-center gap-6">
                <div className="relative">
                  <div className="flex size-20 items-center justify-center rounded-full bg-muted border-2 border-dashed border-muted-foreground/25">
                    {mockProfile.avatar_url ? (
                      <img
                        src={mockProfile.avatar_url}
                        alt="Avatar"
                        className="size-full rounded-full object-cover"
                      />
                    ) : (
                      <User className="size-8 text-muted-foreground" />
                    )}
                  </div>
                  <button className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors">
                    <Camera className="size-3.5" />
                  </button>
                </div>
                <div>
                  <p className="text-sm font-medium">Profile Photo</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    JPG, PNG or GIF. Max 2MB.
                  </p>
                  <Button variant="outline" size="sm" className="mt-2">
                    <Upload className="size-3.5 mr-1.5" />
                    Upload Photo
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Profile Fields */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={mockProfile.email}
                    disabled
                    readOnly
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Email cannot be changed
                  </p>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+234 XXX XXX XXXX"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
                  {isSavingProfile ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          {/* Change Password */}
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <p className="text-sm text-muted-foreground">
                Update your password to keep your account secure
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current_password">Current Password</Label>
                <Input
                  id="current_password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new_password">New Password</Label>
                  <Input
                    id="new_password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm_password">Confirm New Password</Label>
                  <Input
                    id="confirm_password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
              <div className="flex justify-end">
                <Button
                  onClick={handleChangePassword}
                  disabled={
                    isChangingPassword ||
                    !currentPassword ||
                    !newPassword ||
                    !confirmPassword
                  }
                >
                  {isChangingPassword ? 'Changing...' : 'Change Password'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Two-Factor Authentication */}
          <Card>
            <CardHeader>
              <CardTitle>Two-Factor Authentication</CardTitle>
              <p className="text-sm text-muted-foreground">
                Add an extra layer of security to your account
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {twoFactorEnabled ? 'Enabled' : 'Disabled'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {twoFactorEnabled
                      ? 'Your account is protected with 2FA'
                      : 'Enable 2FA to secure your account'}
                  </p>
                </div>
                <Switch
                  checked={twoFactorEnabled}
                  onCheckedChange={handleToggle2FA}
                />
              </div>
              {twoFactorEnabled && (
                <>
                  <Separator />
                  <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                    <p className="text-sm font-medium">Setup Instructions</p>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                      <li>
                        Download an authenticator app (Google Authenticator, Authy)
                      </li>
                      <li>Scan the QR code or enter the setup key manually</li>
                      <li>
                        Enter the 6-digit code from the app to verify setup
                      </li>
                    </ol>
                    <div className="mt-3 flex size-32 items-center justify-center rounded-lg border bg-white">
                      <p className="text-xs text-muted-foreground text-center">
                        QR Code
                        <br />
                        Placeholder
                      </p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Active Sessions */}
          <Card>
            <CardHeader>
              <CardTitle>Active Sessions</CardTitle>
              <p className="text-sm text-muted-foreground">
                Manage your active sessions across devices
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{session.device}</p>
                      {session.isCurrent && (
                        <Badge variant="default" className="text-[10px]">
                          Current
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      IP: {session.ip} &middot; Last active:{' '}
                      {formatDate(session.lastActive)}
                    </p>
                  </div>
                  {!session.isCurrent && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRevokeSession(session.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <p className="text-sm text-muted-foreground">
                Choose what notifications you want to receive
              </p>
            </CardHeader>
            <CardContent className="space-y-1">
              {notificationOptions.map((option, index) => (
                <div key={option.key}>
                  <div className="flex items-center justify-between py-4">
                    <div className="space-y-0.5 pr-4">
                      <p className="text-sm font-medium">{option.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {option.description}
                      </p>
                    </div>
                    <Switch
                      checked={
                        notifications[
                          option.key as keyof typeof notifications
                        ]
                      }
                      onCheckedChange={(checked) =>
                        handleToggleNotification(option.key, checked)
                      }
                    />
                  </div>
                  {index < notificationOptions.length - 1 && <Separator />}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* KYC Tab */}
        <TabsContent value="kyc">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Identity Verification (KYC)</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Verify your identity to unlock full platform features
                  </p>
                </div>
                <Badge variant={kycStatusVariant[kycStatus]}>
                  {kycStatusLabel[kycStatus]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {kycStatus === 'verified' ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 mb-4">
                    <ShieldCheck className="size-8 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-semibold">Identity Verified</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md">
                    Your identity has been verified. You have full access to all
                    platform features including withdrawals.
                  </p>
                </div>
              ) : kycStatus === 'pending' ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <div className="flex size-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950 mb-4">
                    <Shield className="size-8 text-amber-600" />
                  </div>
                  <h3 className="text-lg font-semibold">
                    Verification In Progress
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md">
                    Your documents are being reviewed. This usually takes 1-2
                    business days. We will notify you once the review is
                    complete.
                  </p>
                </div>
              ) : kycStatus === 'rejected' ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <div className="flex size-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950 mb-4">
                    <Shield className="size-8 text-red-600" />
                  </div>
                  <h3 className="text-lg font-semibold">Verification Rejected</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md">
                    Your verification was rejected. Please resubmit with valid
                    documents.
                  </p>
                  <Button className="mt-4" onClick={() => setKycStep(1)}>
                    Resubmit Documents
                  </Button>
                </div>
              ) : (
                // KYC not started -- show multi-step form
                <div className="space-y-6">
                  {/* Step Indicator */}
                  <div className="flex items-center justify-center gap-2">
                    {[1, 2, 3].map((s) => (
                      <div key={s} className="flex items-center gap-2">
                        <div
                          className={cn(
                            'flex size-8 items-center justify-center rounded-full text-xs font-medium transition-colors',
                            s < kycStep
                              ? 'bg-primary text-primary-foreground'
                              : s === kycStep
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {s < kycStep ? (
                            <ShieldCheck className="size-4" />
                          ) : (
                            s
                          )}
                        </div>
                        {s < 3 && (
                          <div
                            className={cn(
                              'h-px w-12 transition-colors',
                              s < kycStep ? 'bg-primary' : 'bg-muted'
                            )}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-center gap-16 text-xs text-muted-foreground">
                    <span>BVN</span>
                    <span>ID Upload</span>
                    <span>Selfie</span>
                  </div>

                  <Separator />

                  {/* Step 1: BVN */}
                  {kycStep === 1 && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium">
                          Step 1: Bank Verification Number
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          Enter your 11-digit BVN for identity verification
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bvn">BVN</Label>
                        <Input
                          id="bvn"
                          value={bvn}
                          onChange={(e) => setBvn(e.target.value)}
                          placeholder="Enter your 11-digit BVN"
                          maxLength={11}
                        />
                        <p className="text-xs text-muted-foreground">
                          Dial *565*0# on your registered phone to retrieve your
                          BVN
                        </p>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          disabled={bvn.length !== 11}
                          onClick={() => setKycStep(2)}
                        >
                          Continue
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Step 2: ID Upload */}
                  {kycStep === 2 && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium">
                          Step 2: Government-Issued ID
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          Upload a clear photo of your valid ID document
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="id_type">ID Type</Label>
                        <select
                          id="id_type"
                          value={idType}
                          onChange={(e) => setIdType(e.target.value)}
                          className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                        >
                          <option value="">Select ID type</option>
                          {KYC_ID_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Upload ID Document</Label>
                        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 hover:border-muted-foreground/50 transition-colors cursor-pointer">
                          <Upload className="size-8 text-muted-foreground mb-2" />
                          <p className="text-sm font-medium">
                            Click to upload or drag and drop
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            JPG, PNG or PDF. Max 5MB.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3 justify-end">
                        <Button
                          variant="outline"
                          onClick={() => setKycStep(1)}
                        >
                          Back
                        </Button>
                        <Button
                          disabled={!idType}
                          onClick={() => setKycStep(3)}
                        >
                          Continue
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Selfie */}
                  {kycStep === 3 && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium">
                          Step 3: Selfie Verification
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          Take a clear selfie to match with your ID document
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Upload Selfie</Label>
                        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 hover:border-muted-foreground/50 transition-colors cursor-pointer">
                          <Camera className="size-8 text-muted-foreground mb-2" />
                          <p className="text-sm font-medium">
                            Click to take a photo or upload
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Ensure good lighting and a clear face view
                          </p>
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                        <p className="font-medium text-foreground">Tips for a good selfie:</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          <li>Face the camera directly</li>
                          <li>Ensure even lighting with no shadows</li>
                          <li>Remove hats, glasses, or face coverings</li>
                          <li>Use a plain background</li>
                        </ul>
                      </div>
                      <div className="flex gap-3 justify-end">
                        <Button
                          variant="outline"
                          onClick={() => setKycStep(2)}
                        >
                          Back
                        </Button>
                        <Button
                          onClick={() => {
                            toast.success(
                              'KYC documents submitted for review'
                            )
                          }}
                        >
                          Submit for Verification
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
