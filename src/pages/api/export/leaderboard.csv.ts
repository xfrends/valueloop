import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { getLeaderboardRows } from '../../../lib/services/analytics';
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

  const rows = await getLeaderboardRows(runtime.env.DB, locals.organization.id, { includeInactive: true });
  const header = ['name', 'email', 'role', 'status', 'total_points', 'total_answered', 'average_score', 'highest_score', 'last_participation_date'];
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.full_name,
        row.email,
        row.role,
        row.status,
        row.total_points,
        row.total_answered,
        row.average_score ?? '',
        row.highest_score ?? '',
        row.last_participation_date ?? '',
      ].map(csvEscape).join(',')
    ),
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="valueloop-leaderboard.csv"',
    },
  });
};
