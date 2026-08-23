import {
  addDays,
  classifyActivitySport,
  daysBetween,
  type ActivitySport,
  type TrainingAdherenceMatchResponse,
  type TrainingSessionPrescription,
  type TrainingSessionType,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import trainingPlanRepository, {
  type ActivityEntryRow,
} from '../models/trainingPlanRepository.js';

/**
 * Matches planned training sessions against what the athlete actually logged.
 *
 * Nothing links a diary activity to a plan, so the match is a heuristic over
 * three signals: the sport (recovered by `classifyActivitySport`, since
 * `exercise_entries` does not store it), how close the day is, and how close
 * the volume is to the prescription. The scoring functions are pure and
 * exported so the heuristic can be tuned against tests rather than a database.
 */

/** A session is matched against activities logged this many days either side. */
const DATE_TOLERANCE_DAYS = 1;

/** Adherence at or above this counts the session done; below the partial floor it is no match. */
const COMPLETED_THRESHOLD = 0.8;
const PARTIAL_THRESHOLD = 0.5;

/** An off-by-a-day activity is still the session, just moved. */
const DATE_SLIP_PENALTY = 0.9;

/**
 * Credit for a sport-and-day match when neither side states a volume. The
 * sport already matched, so this is deliberately above the partial floor but
 * below the completed threshold: it lands as `partial` pending user review.
 */
const UNKNOWN_VOLUME_SIMILARITY = 0.7;

const SPORT_WEIGHT = 0.5;
const VOLUME_WEIGHT = 0.5;

/**
 * The sport a session type prescribes. `null` means "any activity counts"
 * (cross-training is satisfied by soccer, a hike, or a ride alike), and a
 * session type absent from this table is never auto-matched.
 */
const SESSION_TYPE_SPORT: Partial<
  Record<TrainingSessionType, ActivitySport | null>
> = {
  easy_run: 'running',
  intervals: 'running',
  tempo: 'running',
  long_run: 'running',
  race: 'running',
  strength: 'strength',
  cross_train: null,
  other: null,
};

export function isAutoMatchable(sessionType: TrainingSessionType): boolean {
  return sessionType in SESSION_TYPE_SPORT;
}

export function sportForSessionType(
  sessionType: TrainingSessionType
): ActivitySport | null {
  return SESSION_TYPE_SPORT[sessionType] ?? null;
}

export function sportOfActivity(entry: ActivityEntryRow): ActivitySport {
  return classifyActivitySport({
    exerciseName: entry.exercise_name,
    category: entry.category,
    notes: entry.notes,
    providerName: entry.provider_name,
    detailData: entry.detail_data,
    exerciseSourceId: entry.exercise_source_id,
  }).sport;
}

/**
 * The part of a planned session the heuristic reads. A repository
 * `SessionWithCompletion` satisfies it structurally, so the scoring functions
 * stay callable from tests without a database row.
 */
export interface MatchableSession {
  id: string;
  scheduled_date: string;
  session_type: TrainingSessionType;
  prescription: TrainingSessionPrescription;
}

/** Ratio of the smaller value to the larger one; 1 when they are equal. */
function similarity(target: number, actual: number): number {
  if (target <= 0 || actual <= 0) return 0;
  return Math.min(target, actual) / Math.max(target, actual);
}

function volumeSimilarity(
  prescription: TrainingSessionPrescription,
  entry: ActivityEntryRow
): number {
  const targetKm = prescription.distance_km ?? null;
  if (targetKm && entry.distance_km) {
    return similarity(targetKm, entry.distance_km);
  }
  const targetMinutes = prescription.duration_minutes ?? null;
  if (targetMinutes && entry.duration_minutes) {
    return similarity(targetMinutes, entry.duration_minutes);
  }
  return UNKNOWN_VOLUME_SIMILARITY;
}

/**
 * Adherence of one logged activity to one planned session, in `[0, 1]`.
 * Returns 0 when the activity cannot be this session at all (wrong sport, or
 * outside the date tolerance).
 */
export function scoreAdherence(
  session: Omit<MatchableSession, 'id'>,
  entry: ActivityEntryRow
): number {
  if (!isAutoMatchable(session.session_type)) return 0;

  const dayGap = Math.abs(
    daysBetween(session.scheduled_date, entry.entry_date)
  );
  if (dayGap > DATE_TOLERANCE_DAYS) return 0;

  const expectedSport = sportForSessionType(session.session_type);
  if (expectedSport !== null && sportOfActivity(entry) !== expectedSport) {
    return 0;
  }

  const score =
    SPORT_WEIGHT +
    VOLUME_WEIGHT * volumeSimilarity(session.prescription, entry);
  return dayGap === 0 ? score : score * DATE_SLIP_PENALTY;
}

export interface AdherenceMatch {
  session: MatchableSession;
  entry: ActivityEntryRow;
  score: number;
  status: 'completed' | 'partial';
}

/**
 * Assigns activities to sessions greedily by descending score, so the best
 * pairing wins and neither side is used twice — two easy runs in one week must
 * not both claim the same logged run.
 */
export function matchSessionsToActivities(
  sessions: readonly MatchableSession[],
  activities: readonly ActivityEntryRow[]
): AdherenceMatch[] {
  const candidates: AdherenceMatch[] = [];
  for (const session of sessions) {
    for (const entry of activities) {
      const score = scoreAdherence(session, entry);
      if (score < PARTIAL_THRESHOLD) continue;
      candidates.push({
        session,
        entry,
        score,
        status: score >= COMPLETED_THRESHOLD ? 'completed' : 'partial',
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const usedSessions = new Set<string>();
  const usedEntries = new Set<string>();
  const matches: AdherenceMatch[] = [];
  for (const candidate of candidates) {
    if (usedSessions.has(candidate.session.id)) continue;
    if (usedEntries.has(candidate.entry.id)) continue;
    usedSessions.add(candidate.session.id);
    usedEntries.add(candidate.entry.id);
    matches.push(candidate);
  }
  return matches;
}

/**
 * Scores logged activities against the planned sessions in a date range and
 * persists the results. Only `planned` sessions are considered, so a manual or
 * AI review is never overwritten by the heuristic.
 */
export async function matchForUser(
  userId: string,
  startDate: string,
  endDate: string,
  planId?: string
): Promise<TrainingAdherenceMatchResponse> {
  const sessions = (
    await trainingPlanRepository.listSessionsInRange(
      userId,
      startDate,
      endDate,
      planId
    )
  ).filter(
    (session) =>
      session.status === 'planned' && isAutoMatchable(session.session_type)
  );

  if (sessions.length === 0) {
    return { matched: 0, partial: 0, unmatched_sessions: 0 };
  }

  const activities = await trainingPlanRepository.listActivityEntries(
    userId,
    addDays(startDate, -DATE_TOLERANCE_DAYS),
    addDays(endDate, DATE_TOLERANCE_DAYS)
  );

  const matches = matchSessionsToActivities(sessions, activities);

  let matched = 0;
  let partial = 0;
  for (const match of matches) {
    await trainingPlanRepository.upsertCompletion(userId, {
      plan_session_id: match.session.id,
      exercise_entry_id: match.entry.id,
      adherence_score: Math.round(match.score * 100) / 100,
      matched_by: 'auto',
    });
    await trainingPlanRepository.updateSessionStatus(
      userId,
      match.session.id,
      match.status
    );
    if (match.status === 'completed') matched += 1;
    else partial += 1;
  }

  const result: TrainingAdherenceMatchResponse = {
    matched,
    partial,
    unmatched_sessions: sessions.length - matches.length,
  };
  log(
    'info',
    `[trainingAdherence] Matched ${matched} completed / ${partial} partial of ${sessions.length} planned sessions for user ${userId} (${startDate}..${endDate}).`
  );
  return result;
}

export default {
  matchForUser,
  matchSessionsToActivities,
  scoreAdherence,
  sportForSessionType,
  sportOfActivity,
  isAutoMatchable,
};
