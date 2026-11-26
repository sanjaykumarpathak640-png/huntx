import { z } from "zod";

export const clueSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(2000),
  body_alt: z.string().trim().max(2000).nullable().optional(),
  language: z.enum(["en", "hi", "bilingual"]).default("en"),
  difficulty: z.enum(["easy", "medium", "hard", "insane"]).default("medium"),
  target_lat: z.number().finite().min(-90).max(90),
  target_lng: z.number().finite().min(-180).max(180),
  radius_m: z.number().int().min(5).max(2000).default(30),
  time_limit_minutes: z.number().int().min(1).max(24 * 60).nullable().optional(),
  deadline_at: z.string().datetime({ offset: true }).nullable().optional(),
  points: z.number().int().min(0).max(100000).default(100),
  photo_required: z.boolean().default(true),
  is_active: z.boolean().default(true),
  hint: z.string().trim().max(1000).nullable().optional(),
  hint_penalty: z.number().int().min(0).max(100000).default(20),
  unlock_rule: z.enum(["on_submission", "on_approval", "on_verification", "manual"]).default("on_submission"),
  reveal_zone: z.boolean().default(false),
  max_gps_attempts: z.number().int().min(0).max(1000).nullable().optional(),
});
