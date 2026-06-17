import { dbAll, dbFirst } from '../db/client';
import { startOfMonthIso } from '../utils/date';

export async function getDashboardSummary(db: D1Database, organizationId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = startOfMonthIso();

  const stats = await dbFirst<{
    active_members: number;
    challenges_this_month: number;
    average_score_this_month: number | null;
    answered_this_month: number;
    today_sessions: number;
  }>(
    db,
    `select
       (select count(*) from organization_members where organization_id = ? and status = 'active') as active_members,
       (select count(*) from challenge_sessions where organization_id = ? and session_date >= ?) as challenges_this_month,
       (select round(avg(score), 2) from challenge_sessions where organization_id = ? and status = 'scored' and session_date >= ?) as average_score_this_month,
       (select count(*) from challenge_sessions where organization_id = ? and status in ('answered', 'scored') and session_date >= ?) as answered_this_month,
       (select count(*) from challenge_sessions where organization_id = ? and session_date = ?) as today_sessions`,
    [organizationId, organizationId, monthStart.slice(0, 10), organizationId, monthStart.slice(0, 10), organizationId, monthStart.slice(0, 10), organizationId, today]
  );

  const leaderboard = await dbAll(
    db,
    `select * from leaderboard_view where organization_id = ? order by total_points desc, average_score desc, total_answered desc limit 5`,
    [organizationId]
  );

  const valueDistribution = await dbAll(
    db,
    `select cv.name, count(*) as total
     from challenge_sessions cs
     join core_values cv on cv.id = cs.core_value_id
     where cs.organization_id = ? and cs.session_date >= ?
     group by cv.id
     order by total desc`,
    [organizationId, monthStart.slice(0, 10)]
  );

  const participation = await dbFirst<{ rate: number }>(
    db,
    `select round(
       100.0 * count(distinct case when status in ('answered', 'scored') then selected_member_id end)
       / nullif((select count(*) from organization_members where organization_id = ? and status = 'active'), 0),
       2
     ) as rate
     from challenge_sessions
     where organization_id = ? and session_date >= ?`,
    [organizationId, organizationId, monthStart.slice(0, 10)]
  );

  const todayChallenge = await dbFirst(
    db,
    `select cs.*, u.full_name as member_name, cv.name as value_name, q.question_text
     from challenge_sessions cs
     join organization_members om on om.id = cs.selected_member_id
     join users u on u.id = om.user_id
     join core_values cv on cv.id = cs.core_value_id
     join questions q on q.id = cs.question_id
     where cs.organization_id = ? and cs.session_date = ?
     order by cs.sequence_no desc
     limit 1`,
    [organizationId, today]
  );

  return {
    stats,
    leaderboard,
    valueDistribution,
    participationRate: participation?.rate ?? 0,
    todayChallenge,
  };
}

export async function getLeaderboardRows(
  db: D1Database,
  organizationId: string,
  filters: { teamId?: string; fromDate?: string; toDate?: string; includeInactive?: boolean } = {}
) {
  const conditions = [`lv.organization_id = ?`];
  const params: unknown[] = [organizationId];

  if (!filters.includeInactive) {
    conditions.push(`lv.status = 'active'`);
  }
  if (filters.fromDate) {
    conditions.push(`exists (select 1 from challenge_sessions cs where cs.organization_id = lv.organization_id and cs.selected_member_id = lv.organization_member_id and cs.session_date >= ?)`);
    params.push(filters.fromDate);
  }
  if (filters.toDate) {
    conditions.push(`exists (select 1 from challenge_sessions cs where cs.organization_id = lv.organization_id and cs.selected_member_id = lv.organization_member_id and cs.session_date <= ?)`);
    params.push(filters.toDate);
  }
  if (filters.teamId) {
    conditions.push(`exists (select 1 from team_members tm where tm.organization_member_id = lv.organization_member_id and tm.team_id = ? and tm.organization_id = lv.organization_id)`);
    params.push(filters.teamId);
  }

  return dbAll(
    db,
    `select lv.*
     from leaderboard_view lv
     where ${conditions.join(' and ')}
     order by lv.total_points desc, lv.average_score desc, lv.total_answered desc, lv.full_name asc`,
    params
  );
}

export async function getHistorySummary(db: D1Database, organizationId: string) {
  return dbAll(
    db,
    `select
       cs.id,
       cs.session_date,
       cs.sequence_no,
       cs.status,
       cs.score,
       u.full_name as member_name,
       (
         select group_concat(t.name, ', ')
         from team_members tm
         join teams t on t.id = tm.team_id
         where tm.organization_member_id = cs.selected_member_id and tm.organization_id = cs.organization_id
       ) as member_team,
       cv.name as value_name,
       q.question_text
     from challenge_sessions cs
     join organization_members om on om.id = cs.selected_member_id
     join users u on u.id = om.user_id
     join core_values cv on cv.id = cs.core_value_id
     join questions q on q.id = cs.question_id
     where cs.organization_id = ?
     order by cs.session_date desc, cs.sequence_no desc
     limit 25`,
    [organizationId]
  );
}

export async function getInsightsSummary(db: D1Database, organizationId: string) {
  const monthStart = startOfMonthIso().slice(0, 10);

  const valueScores = await dbAll<{
    value_name: string;
    total_asked: number;
    average_score: number | null;
  }>(
    db,
    `select
       cv.name as value_name,
       count(cs.id) as total_asked,
       round(avg(case when cs.status = 'scored' then cs.score end), 2) as average_score
     from core_values cv
     left join challenge_sessions cs on cs.core_value_id = cv.id and cs.organization_id = cv.organization_id
     where cv.organization_id = ?
     group by cv.id
     order by total_asked desc, cv.sort_order asc`,
    [organizationId]
  );

  const teamScores = await dbAll<{
    team_name: string;
    total_answered: number;
    average_score: number | null;
  }>(
    db,
    `select
       t.name as team_name,
       count(case when cs.status = 'scored' then 1 end) as total_answered,
       round(avg(case when cs.status = 'scored' then cs.score end), 2) as average_score
     from teams t
     left join team_members tm on tm.team_id = t.id and tm.organization_id = t.organization_id
     left join challenge_sessions cs
       on cs.selected_member_id = tm.organization_member_id
       and cs.organization_id = t.organization_id
       and cs.status = 'scored'
     where t.organization_id = ?
     group by t.id
     order by average_score desc, total_answered desc, t.name asc`,
    [organizationId]
  );

  const currentRound = await dbFirst<{ round_no: number }>(
    db,
    `select coalesce(max(round_no), 1) as round_no from challenge_sessions where organization_id = ?`,
    [organizationId]
  );

  const notSelectedThisRound = await dbAll<{
    organization_member_id: string;
    full_name: string;
    email: string;
  }>(
    db,
    `select om.id as organization_member_id, u.full_name, u.email
     from organization_members om
     join users u on u.id = om.user_id
     where om.organization_id = ?
       and om.status = 'active'
       and not exists (
         select 1
         from challenge_sessions cs
         where cs.organization_id = om.organization_id
           and cs.selected_member_id = om.id
           and cs.round_no = ?
       )
     order by u.full_name asc`,
    [organizationId, currentRound?.round_no ?? 1]
  );

  const monthStats = await dbFirst<{
    active_members: number;
    selected_members: number;
    total_challenges: number;
    scored_challenges: number;
    average_score: number | null;
  }>(
    db,
    `select
       (select count(*) from organization_members where organization_id = ? and status = 'active') as active_members,
       count(distinct case when cs.session_date >= ? then cs.selected_member_id end) as selected_members,
       count(case when cs.session_date >= ? then 1 end) as total_challenges,
       count(case when cs.session_date >= ? and cs.status = 'scored' then 1 end) as scored_challenges,
       round(avg(case when cs.session_date >= ? and cs.status = 'scored' then cs.score end), 2) as average_score
     from challenge_sessions cs
     where cs.organization_id = ?`,
    [organizationId, monthStart, monthStart, monthStart, monthStart, organizationId]
  );

  const activeMembers = Number(monthStats?.active_members ?? 0);
  const selectedMembers = Number(monthStats?.selected_members ?? 0);

  return {
    valueScores,
    teamScores,
    notSelectedThisRound,
    currentRound: currentRound?.round_no ?? 1,
    monthStats: {
      activeMembers,
      selectedMembers,
      totalChallenges: Number(monthStats?.total_challenges ?? 0),
      scoredChallenges: Number(monthStats?.scored_challenges ?? 0),
      averageScore: monthStats?.average_score ?? null,
      participationRate: activeMembers > 0 ? Math.round((selectedMembers / activeMembers) * 10000) / 100 : 0,
    },
  };
}
