/**
 * KYC rejection-reason templates.
 *
 * The admin viewer used to ask "Explain why this submission is being
 * rejected..." as a free-text field. That meant every reviewer wrote a
 * slightly different message, customers got vague feedback, and
 * resubmissions took several rounds. These templates fix that:
 *
 *   - Each template has a stable `code` so we can analytics + sort
 *     rejection patterns ("60 % of rejections are DOC_BLURRY this week").
 *   - `customerMessage` is the plain-English summary the customer sees
 *     in the rejection email + on the dashboard.
 *   - `actions` is a checklist of what they need to do to fix it. The
 *     email renders this as a numbered <ol>; the dashboard renders it
 *     as a vertical list with green checkmark icons next to each step.
 *   - `adminLabel` is what appears in the dropdown. Compact + obvious.
 *
 * Order in REJECTION_TEMPLATES is the order they appear in the admin
 * dropdown. We put the most common reasons at the top.
 *
 * To add a new template:
 *   1. Append below with a unique upper-snake-case code
 *   2. (Optional) update tests in __tests__/kyc-rejection-templates.test.ts
 *   3. No DB migration — codes live in the `metadata.rejectionCode` JSONB
 *      field on KycSubmission, alongside the freeform `rejectionReason`
 *      column we already have.
 */

export interface KycRejectionTemplate {
  code: string;
  adminLabel: string;
  customerMessage: string;
  actions: string[];
}

export const REJECTION_TEMPLATES: KycRejectionTemplate[] = [
  {
    code: 'DOC_BLURRY',
    adminLabel: 'ID photo too blurry',
    customerMessage:
      'The photo of your ID is too blurry for us to verify the details. We could not clearly read your name or document number.',
    actions: [
      'Find a well-lit spot — natural daylight works best',
      'Hold your phone steady and tap the ID once to focus before snapping',
      'Make sure all four corners of the ID are inside the frame, with no glare',
      'Re-upload the front of the ID',
    ],
  },
  {
    code: 'DOC_EXPIRED',
    adminLabel: 'ID has expired',
    customerMessage:
      'The ID you uploaded has expired. We can only accept government-issued IDs that are currently valid.',
    actions: [
      'Renew your ID at the issuing authority',
      'Or use a different valid ID — NIN, International Passport, or Driver’s License',
      'Re-submit once you have an in-date document',
    ],
  },
  {
    code: 'DOC_NAME_MISMATCH',
    adminLabel: 'Name on ID doesn’t match',
    customerMessage:
      'The name printed on your ID doesn’t match the name you entered in the form. We need both to be exactly the same.',
    actions: [
      'Type your full name letter-for-letter as it appears on the ID — including any middle names and the order they’re printed in',
      'If your ID has a typo, contact the issuing authority to correct it before resubmitting',
      'Re-submit with the matching name',
    ],
  },
  {
    code: 'DOC_WRONG_TYPE',
    adminLabel: 'Wrong document type',
    customerMessage:
      'The document you uploaded isn’t one of the IDs we accept. We need a government-issued NIN, International Passport, or Driver’s License.',
    actions: [
      'Take a fresh photo of one of: NIN slip / card, International Passport (photo page), Driver’s License (front + back)',
      'Make sure the document hasn’t expired',
      'Re-upload to the correct slot',
    ],
  },
  {
    code: 'SELFIE_NOT_LIVE',
    adminLabel: 'Liveness video unclear',
    customerMessage:
      'We couldn’t confirm from your liveness video that you’re a real person in front of the camera. The clip was either too short, in poor light, or didn’t show your face clearly.',
    actions: [
      'Find a well-lit spot facing a window — avoid backlighting',
      'Look straight at the camera and remove glasses, hat, or a face mask',
      'Record a fresh 3–5 second clip clearly saying your full name and today’s date',
      'No filters, no virtual backgrounds, no edited videos',
    ],
  },
  {
    code: 'SELFIE_NO_MATCH',
    adminLabel: 'Selfie doesn’t match ID',
    customerMessage:
      'The face in your selfie / liveness video doesn’t match the photo on the ID you uploaded.',
    actions: [
      'Make sure the ID and the selfie are of the same person',
      'Take a fresh selfie in good light, looking straight at the camera',
      'Re-record the liveness clip',
      'Re-submit',
    ],
  },
  {
    code: 'POA_TOO_OLD',
    adminLabel: 'Proof of address > 3 months old',
    customerMessage:
      'Your proof of address is older than 3 months. We need something dated within the last 90 days.',
    actions: [
      'Find a recent utility bill, bank statement, or tenancy agreement (within the last 3 months)',
      'Make sure your full name and the address are both clearly visible',
      'Re-upload it to the proof-of-address slot',
    ],
  },
  {
    code: 'POA_NAME_MISMATCH',
    adminLabel: 'Address doc not in customer’s name',
    customerMessage:
      'The proof of address isn’t in your name. We need a document that shows your name and your residential address together.',
    actions: [
      'Use a utility bill, bank statement, or tenancy agreement that has your full legal name on it',
      'If you live with someone else and bills aren’t in your name, request a fresh bank statement that is',
      'Re-upload',
    ],
  },
  {
    code: 'POA_ADDRESS_MISMATCH',
    adminLabel: 'Address doc doesn’t match form',
    customerMessage:
      'The address on your proof-of-address document doesn’t match what you entered in the form.',
    actions: [
      'Update the address fields in the form to exactly match the document',
      'Or upload a different proof-of-address document showing the address you entered',
      'Re-submit',
    ],
  },
  {
    code: 'BVN_MISMATCH',
    adminLabel: 'BVN doesn’t match name',
    customerMessage:
      'The BVN you provided doesn’t belong to the name on your ID. The two must be linked at your bank.',
    actions: [
      'Dial *565*0# from a phone registered to your bank to confirm your BVN',
      'If your BVN is correct but the name on it differs, visit your bank to align the records',
      'Re-submit with the corrected information',
    ],
  },
  {
    code: 'INCOMPLETE_INFO',
    adminLabel: 'Incomplete or missing fields',
    customerMessage:
      'Some required fields were missing or incomplete. We need everything filled in before we can review your application.',
    actions: [
      'Re-open the KYC form and fill in any blank fields',
      'Pay extra attention to address, occupation, and source-of-funds',
      'Re-submit',
    ],
  },
  {
    code: 'OTHER',
    adminLabel: 'Other (write a custom reason)',
    customerMessage: '',
    actions: [],
  },
];

/** Look up a template by code. Returns null if the code isn't known. */
export function findRejectionTemplate(code: string | null | undefined): KycRejectionTemplate | null {
  if (!code) return null;
  return REJECTION_TEMPLATES.find((t) => t.code === code) ?? null;
}
