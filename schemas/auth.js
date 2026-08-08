const {
  z,
  emailSchema,
  otpCodeSchema,
  nonEmptyString,
  phoneSchema,
  staffRoles,
} = require('./common');

const OTP_PURPOSES = ['customer_login', 'customer_signup', 'staff_login', 'staff_register'];

const otpSendSchema = z
  .object({
    email: emailSchema,
    purpose: z.enum(OTP_PURPOSES, { message: 'Invalid purpose' }),
    name: z.string().trim().max(120).optional(),
    company: z.string().trim().max(200).optional(),
    phone: phoneSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.purpose === 'customer_signup') {
      if (!data.name || !String(data.name).trim()) {
        ctx.addIssue({ code: 'custom', path: ['name'], message: 'Name is required for signup' });
      }
      if (!data.company || !String(data.company).trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['company'],
          message: 'Company is required for signup',
        });
      }
    }
  });

const otpVerifySchema = z.object({
  email: emailSchema,
  purpose: z.enum(OTP_PURPOSES, { message: 'Invalid purpose' }),
  code: otpCodeSchema.optional(),
  otp: otpCodeSchema.optional(),
}).superRefine((data, ctx) => {
  if (!data.code && !data.otp) {
    ctx.addIssue({ code: 'custom', path: ['code'], message: 'OTP code is required' });
  }
}).transform((data) => ({
  email: data.email,
  purpose: data.purpose,
  code: data.code || data.otp,
}));

const customerLoginSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
});

const staffLoginSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
});

const customerSignupSchema = z.object({
  email: emailSchema,
  name: z.string().trim().max(120).optional(),
  company: z.string().trim().max(200).optional(),
  phone: phoneSchema.optional(),
});

const staffRegisterSchema = z.object({
  email: emailSchema,
  name: nonEmptyString(2, 120),
  phone: phoneSchema,
  role: staffRoles.optional().default('operations'),
  department: z.string().trim().max(120).optional().default(''),
  employeeId: z.string().trim().max(80).optional().default(''),
  reason: nonEmptyString(5, 1000),
});

module.exports = {
  OTP_PURPOSES,
  otpSendSchema,
  otpVerifySchema,
  customerLoginSchema,
  staffLoginSchema,
  customerSignupSchema,
  staffRegisterSchema,
};
