import { redirect } from 'next/navigation'

// Legacy route — virtual cards now live at /dashboard/cards. The Graph
// rail is the only virtual-card provider, so the per-rail subroute
// became redundant once the "Select card type" landing was retired.
export default function GraphCardsLegacyRedirect(): never {
  redirect('/dashboard/cards')
}
