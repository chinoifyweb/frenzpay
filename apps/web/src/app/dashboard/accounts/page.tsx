import { redirect } from 'next/navigation'

// Legacy route. The real "receive" details live on the wallet page, sourced
// from the user's provisioned virtual accounts via the accounts API.
export default function AccountsLegacyRedirect(): never {
  redirect('/dashboard/wallet/receive')
}
