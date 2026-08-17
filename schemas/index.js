const {
  z,
  emailSchema,
  nonEmptyString,
  optionalString,
  phoneSchema,
  gstinSchema,
  panSchema,
  aadhaarSchema,
  aadhaarLast4Schema,
  staffRoles,
  userRoles,
  staffRequestStatuses,
  userStatuses,
  paginationQuery,
} = require('./common');

const staffAccessPatchSchema = z.object({
  status: staffRequestStatuses,
  permissions: z.array(z.string().trim().max(80)).optional(),
  reason: optionalString(1000),
});

const staffUserPatchSchema = z
  .object({
    role: userRoles.optional(),
    status: userStatuses.optional(),
    name: optionalString(120),
    permissions: z.array(z.string().trim().max(80)).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field is required' });

const staffPermissionsSchema = z.object({
  permissions: z.array(z.string().trim().max(80)),
});

const marketingFeatureSchema = z.object({
  label: z.string().trim().min(1).max(300),
  included: z.boolean().optional().default(true),
  group: optionalString(120),
});

const planCreateSchema = z.object({
  id: nonEmptyString(1, 80),
  name: optionalString(120),
  price: z.coerce.number().min(0).optional().default(0),
  discountPercent: z.coerce.number().min(0).max(100).optional().default(0),
  tagline: optionalString(300),
  description: optionalString(800),
  timeline: optionalString(120),
  featured: z.boolean().optional().default(false),
  features: z.array(z.string().trim().max(300)).optional().default([]),
  marketingFeatures: z.array(marketingFeatureSchema).optional().default([]),
  kycDocs: z.array(z.record(z.string(), z.any())).optional().default([]),
  workflowStages: z.array(z.any()).optional().default([]),
});

const planUpdateSchema = z.object({
  name: optionalString(120),
  price: z.coerce.number().min(0).optional(),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  tagline: optionalString(300),
  description: optionalString(800),
  timeline: optionalString(120),
  featured: z.boolean().optional(),
  features: z.array(z.string().trim().max(300)).optional(),
  marketingFeatures: z.array(marketingFeatureSchema).optional(),
  kycDocs: z.array(z.record(z.string(), z.any())).optional(),
  workflowStages: z.array(z.any()).optional(),
});

const createOrderSchema = z.object({
  purpose: z.enum(['plan', 'event', 'workshop', 'custom']).optional(),
  planId: optionalString(80),
  eventId: optionalString(80),
  email: emailSchema.optional(),
  amount: z.coerce.number().min(0).optional(),
  currency: z.string().trim().max(8).optional(),
  description: optionalString(300),
  notes: z.record(z.string(), z.any()).optional(),
  payInInstallments: z.boolean().optional(),
  installmentPlanId: optionalString(80),
  installmentNumber: z.coerce.number().int().min(1).max(12).optional(),
}).passthrough();

const verifyPaymentSchema = z.object({
  razorpay_order_id: nonEmptyString(1, 120),
  razorpay_payment_id: nonEmptyString(1, 120),
  razorpay_signature: nonEmptyString(1, 256),
});

const bookingSchema = z.object({
  email: emailSchema.optional(),
  name: optionalString(120),
  phone: phoneSchema.optional(),
  company: optionalString(200),
  planId: optionalString(80),
  eventId: optionalString(80),
  notes: optionalString(2000),
  paymentId: optionalString(120),
}).passthrough();

const workshopRegisterSchema = z.object({
  email: emailSchema.optional(),
  name: optionalString(120),
  company: optionalString(200),
  phone: phoneSchema.optional(),
  razorpay_payment_id: optionalString(120),
  paymentId: optionalString(120),
}).passthrough();

const supportTicketSchema = z.object({
  email: emailSchema.optional(),
  name: optionalString(120),
  subject: nonEmptyString(3, 200).optional().default('Support request'),
  body: optionalString(5000),
  message: optionalString(5000),
}).superRefine((data, ctx) => {
  const text = data.body || data.message;
  if (!text || !String(text).trim()) {
    ctx.addIssue({ code: 'custom', path: ['body'], message: 'Message body is required' });
  }
}).transform((data) => ({
  email: data.email,
  name: data.name || '',
  subject: data.subject || 'Support request',
  body: data.body || data.message || '',
}));

const leadContactSchema = z.object({
  email: emailSchema,
  name: nonEmptyString(2, 120),
  phone: phoneSchema.optional(),
  company: optionalString(200),
  message: nonEmptyString(5, 5000),
  source: optionalString(80),
});

const conciergeBookSchema = z.object({
  email: emailSchema,
  name: nonEmptyString(2, 120),
  phone: phoneSchema.optional(),
  company: optionalString(200),
  preferredSlot: optionalString(120),
  message: optionalString(2000),
});

const selectPlanSchema = z.object({
  planId: nonEmptyString(1, 80),
});

const assignCaseSchema = z.object({
  opsEmail: emailSchema,
  opsName: optionalString(120),
});

const stageNoteSchema = z.object({
  note: optionalString(2000),
});

const stageRejectSchema = z.object({
  reason: nonEmptyString(3, 2000).optional().default('Update required'),
});

const caseNoteSchema = z
  .object({
    body: optionalString(5000),
    note: optionalString(5000),
  })
  .superRefine((d, ctx) => {
    if (!(d.body || d.note)) {
      ctx.addIssue({ code: 'custom', path: ['body'], message: 'Note body is required' });
    }
  })
  .transform((d) => ({ body: d.body || d.note }));

const caseMessageSchema = z
  .object({
    body: optionalString(5000),
    message: optionalString(5000),
  })
  .superRefine((d, ctx) => {
    if (!(d.body || d.message)) {
      ctx.addIssue({ code: 'custom', path: ['body'], message: 'Message body is required' });
    }
  })
  .transform((d) => ({ body: d.body || d.message }));

const opsRosterSchema = z.union([
  z.object({
    roster: z.array(
      z.object({
        email: emailSchema,
        name: optionalString(120),
        active: z.boolean().optional().default(true),
      })
    ),
  }),
  z.array(
    z.object({
      email: emailSchema,
      name: optionalString(120),
      active: z.boolean().optional().default(true),
    })
  ),
]).transform((d) => ({ roster: Array.isArray(d) ? d : d.roster }));

const kycProfileSchema = z.object({
  legalName: optionalString(200),
  legalEntityName: optionalString(200),
  entityType: optionalString(80),
  incorporationDate: optionalString(40),
  dateOfIncorporation: optionalString(40),
  turnover: optionalString(80),
  annualTurnover: optionalString(80),
  registeredAddress: optionalString(500),
  operatingCity: optionalString(120),
  signatoryName: optionalString(120),
  fullName: optionalString(120),
  designation: optionalString(120),
  panNumber: panSchema,
  pan: panSchema,
  aadhaarNumber: aadhaarSchema,
  aadhaar: aadhaarSchema,
  aadhaarLast4: aadhaarLast4Schema,
}).passthrough();

const kycNeedsMoreSchema = z.object({
  reason: nonEmptyString(3, 2000).optional().default('Additional documents required'),
  missingDocIds: z.array(nonEmptyString(1, 80)).optional().default([]),
  docNotes: z.record(z.string().trim().max(80), z.string().trim().max(1000)).optional().default({}),
});

const kycDocReviewSchema = z.object({
  status: z.enum(['approved', 'rejected', 'pending']),
  note: optionalString(1000),
});

/** Seat/capacity fields are numbers in the UI and strings in some stored docs. */
const optionalSeatValue = z.preprocess(
  (v) => (v == null || v === '' ? undefined : String(v)),
  z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v == null || v === '' ? undefined : v))
);

const eventUpsertSchema = z.object({
  id: optionalString(80),
  title: nonEmptyString(2, 200),
  date: optionalString(80),
  startDate: optionalString(80),
  endDate: optionalString(80),
  city: optionalString(120),
  img: optionalString(500),
  seats: optionalSeatValue,
  capacity: optionalSeatValue,
  desc: optionalString(2000),
  priceInr: z.coerce.number().min(0).optional(),
  price: z.coerce.number().min(0).optional(),
  discountPercent: z.coerce.number().min(0).max(100).optional().default(0),
});

const eventUpdateSchema = z.object({
  title: optionalString(200),
  date: optionalString(80),
  startDate: optionalString(80),
  endDate: optionalString(80),
  city: optionalString(120),
  img: optionalString(500),
  seats: optionalSeatValue,
  capacity: optionalSeatValue,
  desc: optionalString(2000),
  priceInr: z.coerce.number().min(0).optional(),
  price: z.coerce.number().min(0).optional(),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
});

const formBoolOptional = z.preprocess((v) => {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'on';
}, z.boolean().optional());

const brochureUpsertSchema = z.object({
  id: optionalString(80),
  title: optionalString(200),
  name: optionalString(200),
  description: optionalString(2000),
  category: optionalString(120),
  kind: z.enum(['pdf', 'gallery']).optional(),
  path: optionalString(500),
  fileUrl: optionalString(500),
  showInNav: formBoolOptional,
  sortOrder: z.coerce.number().optional(),
}).passthrough();

const profileUpdateSchema = z.object({
  fullName: optionalString(120),
  name: optionalString(120),
  designation: optionalString(120),
  phone: phoneSchema.optional(),
}).refine((d) => d.fullName || d.name || d.designation != null || d.phone != null, {
  message: 'At least one profile field is required',
});

const companyUpdateSchema = z.object({
  legalEntity: optionalString(200),
  gstin: gstinSchema,
  iec: optionalString(40),
  adCode: optionalString(40),
  registeredAddress: optionalString(500),
});

const teamInviteSchema = z.object({
  email: emailSchema,
  role: z.enum(['Viewer', 'Editor', 'Admin', 'Owner']).optional().default('Viewer'),
});

const notificationPrefsSchema = z.object({
  workflow: z.boolean().optional().default(true),
  billing: z.boolean().optional().default(true),
  weekly: z.boolean().optional().default(false),
  marketing: z.boolean().optional().default(false),
});

const docRequestSchema = z.object({
  label: nonEmptyString(2, 200).optional().default('Document request'),
  reason: optionalString(2000),
});

const brochureUpdateSchema = z.object({
  title: optionalString(200),
  name: optionalString(200),
  description: optionalString(2000),
  category: optionalString(120),
  kind: z.enum(['pdf', 'gallery']).optional(),
  path: optionalString(500),
  fileUrl: optionalString(500),
  showInNav: formBoolOptional,
  sortOrder: z.coerce.number().optional(),
}).passthrough();

const emailOutboxRetrySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  action: optionalString(120),
  actor: optionalString(200),
  resourceId: optionalString(120),
  resourceType: optionalString(80),
  q: optionalString(200),
});

const adminPaymentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  period: z.enum(['week', 'month', 'all']).optional().default('month'),
  status: z.enum(['paid', 'created', 'failed', 'refunded', 'all']).optional().default('all'),
  q: optionalString(200),
});

const emailOutboxQuerySchema = z.object({
  status: optionalString(40),
});

const eventNotifySchema = z
  .object({
    kind: z.enum(['reschedule', 'followup', 'update']).optional().default('update'),
    subject: optionalString(200),
    message: nonEmptyString(3, 5000),
    newDate: optionalString(80),
    newCity: optionalString(120),
    emails: z.array(emailSchema).optional(),
    /** When true, also email every customer account (not only event registrants). */
    notifyAllUsers: z.boolean().optional().default(false),
  })
  .superRefine((d, ctx) => {
    if (d.kind === 'reschedule' && !(d.newDate || d.message)) {
      ctx.addIssue({
        code: 'custom',
        path: ['newDate'],
        message: 'Provide a new date or message for reschedule',
      });
    }
  });

const transcriptsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  scope: z
    .enum(['all', 'events', 'plans', 'messages', 'audit'])
    .optional()
    .default('all'),
  q: optionalString(200),
  caseId: optionalString(80),
  eventId: optionalString(80),
});

const optionalEmail = z.preprocess(
  (v) => (v == null || v === '' ? undefined : v),
  emailSchema.optional()
);

const invoiceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  email: optionalEmail,
  caseId: optionalString(80),
  paymentId: optionalString(120),
});

const vaultRejectSchema = z.object({
  reason: nonEmptyString(1, 2000).optional().default('Rejected'),
});

const vaultCommentSchema = z.object({
  text: nonEmptyString(1, 2000),
});

const vaultChecklistSchema = z.array(
  z.object({
    id: optionalString(80),
    docId: optionalString(80),
    name: optionalString(200),
    status: optionalString(40),
    size: optionalString(40),
    updated: optionalString(40),
  })
);

const caseListQuerySchema = z.object({
  status: optionalString(80),
  kycStatus: optionalString(80),
  opsEmail: optionalEmail,
  q: optionalString(200),
});

const staffAccessListQuerySchema = z.object({
  status: z.preprocess(
    (v) => (v == null || v === '' ? undefined : v),
    staffRequestStatuses.optional()
  ),
  q: optionalString(200),
});

const vaultChecklistBodySchema = z.preprocess(
  (v) => (Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : []),
  vaultChecklistSchema
);

const idParamSchema = (key = 'id') =>
  z.object({
    [key]: nonEmptyString(1, 120),
  });

const caseDocParamsSchema = z.object({
  caseId: nonEmptyString(1, 120),
  docId: nonEmptyString(1, 120),
});

const objectIdParamSchema = (key = 'id') =>
  z.object({
    [key]: z
      .string()
      .trim()
      .regex(/^[a-fA-F0-9]{24}$/, { message: `Invalid ${key}` }),
  });

const emptyBodySchema = z.object({}).passthrough();

module.exports = {
  staffAccessPatchSchema,
  staffUserPatchSchema,
  staffPermissionsSchema,
  planCreateSchema,
  planUpdateSchema,
  createOrderSchema,
  verifyPaymentSchema,
  bookingSchema,
  workshopRegisterSchema,
  supportTicketSchema,
  leadContactSchema,
  conciergeBookSchema,
  selectPlanSchema,
  assignCaseSchema,
  stageNoteSchema,
  stageRejectSchema,
  caseNoteSchema,
  caseMessageSchema,
  docRequestSchema,
  kycProfileSchema,
  kycNeedsMoreSchema,
  kycDocReviewSchema,
  eventUpsertSchema,
  eventUpdateSchema,
  eventNotifySchema,
  brochureUpsertSchema,
  brochureUpdateSchema,
  profileUpdateSchema,
  companyUpdateSchema,
  teamInviteSchema,
  notificationPrefsSchema,
  opsRosterSchema,
  staffRoles,
  emailOutboxRetrySchema,
  auditQuerySchema,
  adminPaymentsQuerySchema,
  emailOutboxQuerySchema,
  transcriptsQuerySchema,
  invoiceListQuerySchema,
  vaultRejectSchema,
  vaultCommentSchema,
  vaultChecklistSchema,
  vaultChecklistBodySchema,
  caseListQuerySchema,
  staffAccessListQuerySchema,
  idParamSchema,
  caseDocParamsSchema,
  objectIdParamSchema,
  emptyBodySchema,
  paginationQuery,
};
