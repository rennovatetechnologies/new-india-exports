const { z } = require('zod');
const { normalizeEmail } = require('../services/helpers');

const emailSchema = z
  .email({ message: 'Valid email required' })
  .transform((v) => normalizeEmail(v));

const otpCodeSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(/\D/g, ''))
  .refine((v) => /^\d{6}$/.test(v), { message: 'OTP must be a 6-digit code' });

const nonEmptyString = (min = 1, max = 500) =>
  z
    .string()
    .trim()
    .min(min, { message: `Must be at least ${min} character(s)` })
    .max(max, { message: `Must be at most ${max} character(s)` });

const optionalString = (max = 500) =>
  z.preprocess(
    (v) => (v == null ? undefined : v),
    z
      .string()
      .trim()
      .max(max)
      .optional()
      .transform((v) => (v == null || v === '' ? undefined : v))
  );

const phoneSchema = z.preprocess(
  (v) => (v == null ? '' : v),
  z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => (v == null ? '' : v))
    .refine((v) => v === '' || /^[+]?[\d\s()-]{7,20}$/.test(v), {
      message: 'Invalid phone number',
    })
);

const gstinSchema = z.preprocess(
  (v) => (v == null ? '' : v),
  z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => (v == null || v === '' ? '' : v))
    .refine((v) => v === '' || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(v), {
      message: 'Invalid GSTIN',
    })
);

const panSchema = z.preprocess(
  (v) => (v == null ? '' : v),
  z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => (v == null || v === '' ? '' : String(v).replace(/\s+/g, '')))
    .refine((v) => v === '' || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v), {
      message: 'Invalid PAN (format: AAAAA9999A)',
    })
);

/** Full 12-digit Aadhaar (spaces/hyphens stripped). Empty allowed for draft saves. */
const aadhaarSchema = z.preprocess(
  (v) => (v == null ? '' : v),
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => String(v ?? '').replace(/\D/g, ''))
    .refine((v) => v === '' || /^\d{12}$/.test(v), {
      message: 'Aadhaar must be a 12-digit number',
    })
);

/** Legacy last-4 field — still accepted; prefer aadhaarNumber. */
const aadhaarLast4Schema = z.preprocess(
  (v) => (v == null ? '' : v),
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v == null || v === '' ? '' : String(v).replace(/\D/g, '')))
    .refine((v) => v === '' || /^\d{4}$/.test(v), { message: 'aadhaarLast4 must be 4 digits' })
);

const staffRoles = z.enum(['operations', 'admin']);
const userRoles = z.enum(['customer', 'operations', 'admin']);
const staffRequestStatuses = z.enum([
  'Approved',
  'Rejected',
  'Suspended',
  'Active',
  'Pending Approval',
]);
const userStatuses = z.enum(['Active', 'Suspended', 'Rejected', 'Pending Approval']);

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  q: z.string().trim().max(200).optional(),
  status: z.string().trim().max(80).optional(),
});

module.exports = {
  z,
  emailSchema,
  otpCodeSchema,
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
};
