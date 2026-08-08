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
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v == null || v === '' ? undefined : v));

const phoneSchema = z
  .string()
  .trim()
  .max(20)
  .optional()
  .transform((v) => (v == null ? '' : v))
  .refine((v) => v === '' || /^[+]?[\d\s()-]{7,20}$/.test(v), {
    message: 'Invalid phone number',
  });

const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .transform((v) => (v == null || v === '' ? '' : v))
  .refine((v) => v === '' || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(v), {
    message: 'Invalid GSTIN',
  });

const panSchema = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .transform((v) => (v == null || v === '' ? '' : v))
  .refine((v) => v === '' || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v), {
    message: 'Invalid PAN',
  });

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
  staffRoles,
  userRoles,
  staffRequestStatuses,
  userStatuses,
  paginationQuery,
};
