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

export const authSignupSchema = z.object({
  fullName: z.string({ error: 'Nama lengkap wajib diisi.' }).trim().min(2, 'Nama lengkap minimal 2 karakter.').max(120, 'Nama lengkap maksimal 120 karakter.'),
  email: trimmedEmail,
  password: z.string({ error: 'Kata sandi wajib diisi.' }).min(8, 'Kata sandi minimal 8 karakter.').max(200, 'Kata sandi maksimal 200 karakter.'),
  termsAccepted,
});

export const authLoginSchema = z.object({
  email: trimmedEmail,
  password: z.string().min(1).max(200),
  rememberMe: checkboxValue,
});

export const organizationCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(120).optional(),
  timezone: z.string().trim().min(1).default('Asia/Jakarta'),
  defaultLocale: z.string().trim().min(1).default('id'),
  templateId: z.string().trim().optional(),
});

export const valueSchema = z.object({
  name: z.string().trim().min(2).max(120),
  shortDescription: z.string().trim().min(2).max(200),
  description: z.string().trim().optional().default(''),
  example: z.string().trim().optional().default(''),
  color: z.string().trim().min(1).default('#2563EB'),
  iconName: z.string().trim().min(1).default('star'),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.coerce.number().int().min(0).max(1).default(1),
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
  answerText: z.string().trim().min(3).max(5000),
});

export const challengeScoreSchema = z.object({
  score: z.coerce.number().int().min(0).max(10),
  evaluatorNote: z.string().trim().optional().default(''),
});

export const memberInviteSchema = z.object({
  email: trimmedEmail,
  role: z.enum(['owner', 'admin', 'facilitator', 'member', 'viewer']),
});

export const teamSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().optional().default(''),
  isActive: z.coerce.number().int().min(0).max(1).default(1),
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
