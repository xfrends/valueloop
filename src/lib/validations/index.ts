import { z } from 'zod';

const trimmedEmail = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z.string({ error: 'Email wajib diisi.' }).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email tidak valid.')
);
const termsAccepted = z.preprocess(
  (value) => value === true || value === 'true' || value === 'on' || value === '1' || value === 1,
  z.boolean().refine((value) => value, 'Anda harus menyetujui Syarat & Ketentuan dan Kebijakan Privasi.')
);
const checkboxValue = z.preprocess(
  (value) => value === true || value === 'true' || value === 'on' || value === '1' || value === 1,
  z.boolean().default(false)
);
const emptyStringAsUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const authSignupSchema = z.object({
  fullName: z.string({ error: 'Nama lengkap wajib diisi.' }).trim().min(2, 'Nama lengkap minimal 2 karakter.').max(120, 'Nama lengkap maksimal 120 karakter.'),
  email: trimmedEmail,
  password: z.string({ error: 'Kata sandi wajib diisi.' }).min(8, 'Kata sandi minimal 8 karakter.').max(200, 'Kata sandi maksimal 200 karakter.'),
  termsAccepted,
});

export const authLoginSchema = z.object({
  email: trimmedEmail,
  password: z
    .string({ error: 'Kata sandi wajib diisi.' })
    .min(1, 'Kata sandi wajib diisi.')
    .max(200, 'Kata sandi maksimal 200 karakter.'),
  rememberMe: checkboxValue,
});

export const userProfileSchema = z.object({
  fullName: z.string({ error: 'Nama lengkap wajib diisi.' }).trim().min(2, 'Nama lengkap minimal 2 karakter.').max(120, 'Nama lengkap maksimal 120 karakter.'),
  email: trimmedEmail,
  currentPassword: z.string().max(200, 'Kata sandi saat ini maksimal 200 karakter.').optional().default(''),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().max(200, 'Kata sandi saat ini maksimal 200 karakter.').optional().default(''),
  newPassword: z.string({ error: 'Kata sandi baru wajib diisi.' }).min(8, 'Kata sandi baru minimal 8 karakter.').max(200, 'Kata sandi baru maksimal 200 karakter.'),
  confirmPassword: z.string({ error: 'Konfirmasi kata sandi wajib diisi.' }).min(1, 'Konfirmasi kata sandi wajib diisi.').max(200),
}).refine((value) => value.newPassword === value.confirmPassword, {
  message: 'Konfirmasi kata sandi tidak cocok.',
  path: ['confirmPassword'],
});

export const organizationCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  timezone: z.string().trim().min(1).default('Asia/Jakarta'),
  defaultLocale: z.string().trim().min(1).default('id'),
  templateId: z.string().trim().optional(),
});

export const valueSchema = z.object({
  name: z.string({ error: 'Nama core value wajib diisi.' }).trim().min(2, 'Nama core value minimal 2 karakter.').max(120, 'Nama core value maksimal 120 karakter.'),
  shortDescription: z.string({ error: 'Deskripsi singkat wajib diisi.' }).trim().min(2, 'Deskripsi singkat minimal 2 karakter.').max(200, 'Deskripsi singkat maksimal 200 karakter.'),
  description: z.string().trim().optional().default(''),
  example: z.string().trim().optional().default(''),
  color: z.preprocess(emptyStringAsUndefined, z.string().trim().min(1).default('#2563EB')),
  iconName: z.preprocess(emptyStringAsUndefined, z.string().trim().min(1).default('star')),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.preprocess(emptyStringAsUndefined, z.coerce.number().int().min(0).max(1).default(0)),
  expectedBehaviors: z.string().trim().optional().default(''),
  antiPatterns: z.string().trim().optional().default(''),
});

export const questionSchema = z.object({
  coreValueId: z.string().trim().min(1),
  questionText: z.string().trim().min(2).max(1000),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('easy'),
  suggestedRubricNote: z.string().trim().optional().default(''),
  isActive: z.coerce.number().int().min(0).max(1).default(1),
});

export const challengeAnswerSchema = z.object({
  answerText: z.string({ error: 'Jawaban wajib diisi.' }).trim().min(3, 'Jawaban minimal 3 karakter.').max(5000, 'Jawaban maksimal 5000 karakter.'),
});

export const challengeScoreSchema = z.object({
  score: z.coerce.number({ error: 'Skor wajib dipilih.' }).int('Skor harus berupa angka bulat.').min(0, 'Skor minimal 0.').max(10, 'Skor maksimal 10.'),
  evaluatorNote: z.string().trim().optional().default(''),
});

export const memberInviteSchema = z.object({
  email: trimmedEmail,
  role: z.enum(['owner', 'admin', 'facilitator', 'member', 'viewer']),
});

export const teamSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().optional().default(''),
  isActive: z.preprocess(emptyStringAsUndefined, z.coerce.number().int().min(0).max(1).default(1)),
});

export const teamMemberSchema = z.object({
  organizationMemberId: z.string().trim().min(1),
});

export const organizationSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9-]+$/),
  timezone: z.string().trim().min(1).default('Asia/Jakarta'),
  defaultLocale: z.string().trim().min(1).default('id'),
  challengeFrequency: z.string().trim().min(1).default('daily'),
  questionCooldownDays: z.coerce.number().int().min(0).max(365).default(14),
  allowMultipleChallengesPerDay: z.coerce.number().int().min(0).max(1).default(0),
  allowSelfScoring: z.coerce.number().int().min(0).max(1).default(0),
});

export const articleSchema = z.object({
  title: z.string().trim().min(5).max(180),
  slug: z.string().trim().min(3).max(180).optional().default(''),
  excerpt: z.string().trim().min(20).max(500),
  contentHtml: z.string().trim().min(50),
  category: z.string().trim().min(2).max(80),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  authorName: z.string().trim().min(2).max(120).default('Admin ValueLoop'),
  thumbnailR2Key: z.string().trim().optional().default(''),
  thumbnailAlt: z.string().trim().optional().default(''),
  niche: z.string().trim().optional().default(''),
  targetMarket: z.string().trim().optional().default(''),
  seoTitle: z.string().trim().optional().default(''),
  seoDescription: z.string().trim().optional().default(''),
  readingMinutes: z.coerce.number().int().min(1).max(60).optional(),
});

export const articleAiGenerateSchema = z.object({
  niche: z.string().trim().min(3).max(160),
  targetMarket: z.string().trim().min(3).max(240),
  mainKeyword: z.string().trim().min(2).max(120),
  topic: z.string().trim().max(200).optional().default(''),
  tone: z.string().trim().max(160).optional().default('profesional, jelas, actionable'),
  status: z.enum(['draft', 'published']).default('draft'),
});
