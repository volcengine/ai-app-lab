import { z } from 'zod';

const claimSchema = z.object({
  text: z.string().min(1).max(600),
  evidence_ids: z.array(z.string()).min(1).max(8),
});

export const generatedReportSchema = z.object({
  status: z.enum(['sufficient', 'insufficient']),
  summary: z.string().min(1).max(500),
  summary_evidence_ids: z.array(z.string()).min(1).max(8),
  change_summary: z.string().min(1).max(500),
  change_evidence_ids: z.array(z.string()).max(8),
  risk_level: z.enum(['low', 'medium', 'high', 'unknown']),
  sections: z.array(z.object({
    title: z.string().min(1).max(80),
    claims: z.array(claimSchema).min(1).max(8),
  })).min(1).max(6),
  conclusion: z.object({
    text: z.string().min(1).max(600),
    evidence_ids: z.array(z.string()).min(1).max(8),
  }),
  limitations: z.array(z.string().max(300)).max(8),
});

const generatedReportModelSchema = generatedReportSchema.omit({ sections: true }).extend({
  claims: z.array(z.object({
    section_title: z.string().min(1).max(80),
    text: z.string().min(1).max(600),
    evidence_ids: z.array(z.string()).min(1).max(8),
  })).min(1).max(24),
});

export function materializeGeneratedReport(value) {
  const parsed = generatedReportModelSchema.parse(value);
  const sectionsByTitle = new Map();
  for (const claim of parsed.claims) {
    const claims = sectionsByTitle.get(claim.section_title) || [];
    claims.push({ text: claim.text, evidence_ids: claim.evidence_ids });
    sectionsByTitle.set(claim.section_title, claims);
  }
  const { claims: _claims, ...report } = parsed;
  return generatedReportSchema.parse({
    ...report,
    sections: [...sectionsByTitle].map(([title, claims]) => ({ title, claims })),
  });
}

export const generatedReportJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['sufficient', 'insufficient'] },
    summary: { type: 'string' },
    summary_evidence_ids: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } },
    change_summary: { type: 'string' },
    change_evidence_ids: { type: 'array', maxItems: 8, items: { type: 'string' } },
    risk_level: { type: 'string', enum: ['low', 'medium', 'high', 'unknown'] },
    claims: {
      type: 'array',
      minItems: 1,
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          section_title: { type: 'string' },
          text: { type: 'string' },
          evidence_ids: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } },
        },
        required: ['section_title', 'text', 'evidence_ids'],
      },
    },
    conclusion: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string' },
        evidence_ids: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } },
      },
      required: ['text', 'evidence_ids'],
    },
    limitations: { type: 'array', maxItems: 8, items: { type: 'string' } },
  },
  required: [
    'status',
    'summary',
    'summary_evidence_ids',
    'change_summary',
    'change_evidence_ids',
    'risk_level',
    'claims',
    'conclusion',
    'limitations',
  ],
};

export const reportVerificationJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    valid: { type: 'boolean' },
    issues: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          location: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['location', 'reason'],
      },
    },
  },
  required: ['valid', 'issues'],
};

const preferenceScopeSchema = z.enum(['company', 'external']);

export const semanticQueryPlanSchema = z.object({
  queries: z.array(z.object({
    preference: z.string().min(1).max(160),
    scope: preferenceScopeSchema,
    query: z.string().min(8).max(320),
  })).max(12),
});

export const semanticQueryPlanJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    queries: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          preference: { type: 'string' },
          scope: { type: 'string', enum: ['company', 'external'] },
          query: { type: 'string' },
        },
        required: ['preference', 'scope', 'query'],
      },
    },
  },
  required: ['queries'],
};

export const semanticEvidenceBindingSchema = z.object({
  matches: z.array(z.object({
    candidate_id: z.string().min(1).max(80),
    preference: z.string().min(1).max(160),
    scope: preferenceScopeSchema,
    quote: z.string().min(12).max(360),
  })).max(24),
});

export const semanticEvidenceBindingJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    matches: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          candidate_id: { type: 'string' },
          preference: { type: 'string' },
          scope: { type: 'string', enum: ['company', 'external'] },
          quote: { type: 'string' },
        },
        required: ['candidate_id', 'preference', 'scope', 'quote'],
      },
    },
  },
  required: ['matches'],
};
