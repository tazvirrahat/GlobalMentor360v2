import { z } from "zod";

/**
 * Validation for the bKash manual rail.
 *
 * These rules deliberately mirror the CHECK constraints in
 * prisma/migrations/*_payment_check_constraints. The database is the authority —
 * this layer exists to produce a readable error instead of a raw constraint
 * violation, not to be the only thing standing between bad input and the table.
 */

// Bangladesh mobile numbers: 11 digits starting 01.
export const BKASH_PHONE_PATTERN = /^01\d{9}$/;

export const bkashSubmissionSchema = z.object({
  courseId: z.string().min(1),
  transactionId: z
    .string()
    .trim()
    .min(4, "Enter the transaction ID from your bKash confirmation.")
    .max(64),
  phoneNumber: z
    .string()
    .trim()
    .regex(BKASH_PHONE_PATTERN, "Enter the 11-digit bKash number, e.g. 01712345678."),
  paymentDate: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), "Enter a valid date.")
    .refine((value) => {
      const date = new Date(value);
      // A payment dated in the future is either a typo or someone guessing.
      return date.getTime() <= Date.now() + 24 * 60 * 60 * 1000;
    }, "Payment date cannot be in the future."),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
});

export type BkashSubmission = z.infer<typeof bkashSubmissionSchema>;

/** bKash settles in BDT; the constraint rejects anything else. */
export const BKASH_CURRENCY = "BDT";
