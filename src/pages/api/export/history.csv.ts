import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { listChallengeSessions } from '../../../lib/services/challenge';
import { canExportReports } from '../../../lib/permissions';

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export const GET: APIRoute = async ({ locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB) {
    return new Response('Konfigurasi runtime tidak tersedia.', { status: 500 });
  }

  if (!locals.organization || !locals.membership) {
    return new Response('Organisasi tidak tersedia.', { status: 403 });
  }
  if (!canExportReports(locals.membership.role)) {
    return new Response('Anda tidak memiliki izin untuk export report.', { status: 403 });
  }

  const rows = await listChallengeSessions(runtime.env.DB, locals.organization.id, { limit: 1000 });
  const header = ['session_date', 'member_name', 'member_team', 'value_name', 'question_text', 'answer_text', 'score', 'status'];
  const lines = [
    header.join(','),
    ...rows.map((row) => [
      row.session_date,
      row.member_name,
      row.member_team || '',
      row.value_name,
      row.question_text,
      row.answer_text || '',
      row.score ?? '',
      row.status,
    ].map(csvEscape).join(',')),
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="valueloop-history.csv"',
    },
  });
};
