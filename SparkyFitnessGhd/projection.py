"""
Project GHD SQLite warehouse rows into the Sparky training JSON contract.

Empty top-level arrays and empty sample series are omitted. GPS tracks are
downsampled to at most MAX_GPS_POINTS.
"""

from __future__ import annotations

import json
import logging
import math
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Optional

from service import user_db_path

logger = logging.getLogger(__name__)

MAX_GPS_POINTS = 500

SLEEP_STAGE_MAP: dict[Any, str] = {
    "DEEP": "deep",
    "LIGHT": "light",
    "REM": "rem",
    "AWAKE": "awake",
    0: "deep",
    1: "light",
    2: "rem",
    3: "awake",
}


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
        (name,),
    ).fetchone()
    return row is not None


def _iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    text = str(value).strip()
    return text or None


def _parse_naive_datetime(value: Any) -> Optional[datetime]:
    """Parse GHD timestamps (usually UTC-naive strings without timezone)."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    text = str(value).strip()
    if not text:
        return None
    text = text.replace("Z", "").replace("z", "")
    if "T" in text:
        text = text.replace("T", " ", 1)
    # Trim fractional seconds to 6 digits for strptime.
    if "." in text:
        head, frac = text.split(".", 1)
        digits = "".join(ch for ch in frac if ch.isdigit())[:6]
        text = f"{head}.{digits}" if digits else head
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(str(value).strip().replace("Z", ""))
    except ValueError:
        return None


def _local_wall_clock(start_ts: Any, offset_hours: Any) -> Optional[str]:
    """
    Convert GHD activity start_ts (UTC-naive) to local wall clock using
    timezone_offset_hours. Matches Garmin Connect startTimeLocal semantics so
    diary entry_date aligns with classic Garmin and evening activities do not
    roll to the next UTC calendar day.
    """
    utc_dt = _parse_naive_datetime(start_ts)
    if utc_dt is None:
        return _iso(start_ts)
    offset = _num(offset_hours)
    if offset is None:
        return utc_dt.strftime("%Y-%m-%d %H:%M:%S")
    local = utc_dt + timedelta(hours=float(offset))
    return local.strftime("%Y-%m-%d %H:%M:%S")


def _local_date_str(start_ts: Any, offset_hours: Any) -> Optional[str]:
    wall = _local_wall_clock(start_ts, offset_hours)
    return wall[:10] if wall else None


def _as_date_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value.isoformat()
    text = str(value).strip()
    return text[:10] if text else None


def _num(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    try:
        f = float(value)
        if not math.isfinite(f):
            return None
        return int(f) if f.is_integer() else f
    except (TypeError, ValueError):
        return None


def _downsample(
    points: list[dict[str, Any]], max_points: int = MAX_GPS_POINTS
) -> list[dict[str, Any]]:
    n = len(points)
    if n <= max_points or max_points < 2:
        return points[:max_points]
    out: list[dict[str, Any]] = [points[0]]
    inner = max_points - 2
    for i in range(inner):
        idx = 1 + int(round(i * (n - 3) / max(inner - 1, 1)))
        idx = min(max(idx, 1), n - 2)
        if out[-1] is not points[idx]:
            out.append(points[idx])
    if out[-1] is not points[-1]:
        out.append(points[-1])
    return out


def _empty_daily(day: str) -> dict[str, Any]:
    return {
        "date": day,
        "steps": None,
        "active_calories": None,
        "bmr_calories": None,
        "total_calories": None,
        "floors_ascended": None,
        "floors_descended": None,
        "moderate_intensity_minutes": None,
        "vigorous_intensity_minutes": None,
        "resting_heart_rate": None,
        "avg_stress": None,
        "max_stress": None,
        "body_battery_high": None,
        "body_battery_low": None,
        "body_battery_charged": None,
        "body_battery_drained": None,
        "vo2_max": None,
        "training_readiness_score": None,
        "acute_training_load": None,
        "chronic_training_load": None,
        "acwr": None,
        "recovery_time_minutes": None,
    }


def _project_daily_metrics(
    conn: sqlite3.Connection, start: str, end: str
) -> list[dict[str, Any]]:
    by_date: dict[str, dict[str, Any]] = {}

    def row_for(day: str) -> dict[str, Any]:
        if day not in by_date:
            by_date[day] = _empty_daily(day)
        return by_date[day]

    if _table_exists(conn, "steps"):
        for r in conn.execute(
            """
            SELECT date(timestamp) AS d, SUM(value) AS steps
            FROM steps
            WHERE date(timestamp) >= ? AND date(timestamp) <= ?
            GROUP BY date(timestamp)
            """,
            (start, end),
        ):
            if r["d"]:
                row_for(r["d"])["steps"] = _num(r["steps"])

    if _table_exists(conn, "floors"):
        for r in conn.execute(
            """
            SELECT date(timestamp) AS d,
                   SUM(ascended) AS ascended,
                   SUM(descended) AS descended
            FROM floors
            WHERE date(timestamp) >= ? AND date(timestamp) <= ?
            GROUP BY date(timestamp)
            """,
            (start, end),
        ):
            if not r["d"]:
                continue
            row = row_for(r["d"])
            row["floors_ascended"] = _num(r["ascended"])
            row["floors_descended"] = _num(r["descended"])

    if _table_exists(conn, "training_load"):
        for r in conn.execute(
            """
            SELECT date AS d, moderate_minutes, vigorous_minutes,
                   daily_training_load_acute, daily_training_load_chronic,
                   daily_acute_chronic_workload_ratio, acwr_percent
            FROM training_load
            WHERE date >= ? AND date <= ?
            """,
            (start, end),
        ):
            day = _as_date_str(r["d"])
            if not day:
                continue
            row = row_for(day)
            row["moderate_intensity_minutes"] = _num(r["moderate_minutes"])
            row["vigorous_intensity_minutes"] = _num(r["vigorous_minutes"])
            row["acute_training_load"] = _num(r["daily_training_load_acute"])
            row["chronic_training_load"] = _num(r["daily_training_load_chronic"])
            acwr = r["daily_acute_chronic_workload_ratio"]
            if acwr is None:
                acwr = r["acwr_percent"]
            row["acwr"] = _num(acwr)

    if _table_exists(conn, "vo2_max"):
        for r in conn.execute(
            """
            SELECT date AS d, vo2_max_generic, vo2_max_cycling
            FROM vo2_max
            WHERE date >= ? AND date <= ?
            """,
            (start, end),
        ):
            day = _as_date_str(r["d"])
            if not day:
                continue
            vo2 = (
                r["vo2_max_generic"]
                if r["vo2_max_generic"] is not None
                else r["vo2_max_cycling"]
            )
            row_for(day)["vo2_max"] = _num(vo2)

    if _table_exists(conn, "training_readiness"):
        for r in conn.execute(
            """
            SELECT date(timestamp) AS d, score, recovery_time, acute_load
            FROM training_readiness
            WHERE date(timestamp) >= ? AND date(timestamp) <= ?
            ORDER BY timestamp DESC
            """,
            (start, end),
        ):
            if not r["d"]:
                continue
            row = row_for(r["d"])
            if row["training_readiness_score"] is None:
                row["training_readiness_score"] = _num(r["score"])
                row["recovery_time_minutes"] = _num(r["recovery_time"])
                if row["acute_training_load"] is None:
                    row["acute_training_load"] = _num(r["acute_load"])

    if _table_exists(conn, "stress"):
        for r in conn.execute(
            """
            SELECT date(timestamp) AS d,
                   AVG(CASE WHEN value >= 0 THEN value END) AS avg_stress,
                   MAX(CASE WHEN value >= 0 THEN value END) AS max_stress
            FROM stress
            WHERE date(timestamp) >= ? AND date(timestamp) <= ?
            GROUP BY date(timestamp)
            """,
            (start, end),
        ):
            if not r["d"]:
                continue
            row = row_for(r["d"])
            row["avg_stress"] = _num(r["avg_stress"])
            row["max_stress"] = _num(r["max_stress"])

    if _table_exists(conn, "body_battery"):
        for r in conn.execute(
            """
            SELECT date(timestamp) AS d,
                   MAX(value) AS high_v,
                   MIN(value) AS low_v
            FROM body_battery
            WHERE date(timestamp) >= ? AND date(timestamp) <= ?
            GROUP BY date(timestamp)
            """,
            (start, end),
        ):
            if not r["d"]:
                continue
            day = r["d"]
            row = row_for(day)
            row["body_battery_high"] = _num(r["high_v"])
            row["body_battery_low"] = _num(r["low_v"])
            first = conn.execute(
                """
                SELECT value FROM body_battery
                WHERE date(timestamp) = ?
                ORDER BY timestamp ASC LIMIT 1
                """,
                (day,),
            ).fetchone()
            last = conn.execute(
                """
                SELECT value FROM body_battery
                WHERE date(timestamp) = ?
                ORDER BY timestamp DESC LIMIT 1
                """,
                (day,),
            ).fetchone()
            if (
                first
                and last
                and first["value"] is not None
                and last["value"] is not None
            ):
                delta = float(last["value"]) - float(first["value"])
                if delta >= 0:
                    row["body_battery_charged"] = _num(delta)
                    row["body_battery_drained"] = 0
                else:
                    row["body_battery_charged"] = 0
                    row["body_battery_drained"] = _num(abs(delta))

    if _table_exists(conn, "sleep"):
        for r in conn.execute(
            """
            SELECT calendar_date AS d, resting_heart_rate
            FROM sleep
            WHERE calendar_date >= ? AND calendar_date <= ?
              AND resting_heart_rate IS NOT NULL
            ORDER BY end_ts DESC
            """,
            (start, end),
        ):
            day = _as_date_str(r["d"])
            if not day:
                continue
            row = row_for(day)
            if row["resting_heart_rate"] is None:
                row["resting_heart_rate"] = _num(r["resting_heart_rate"])

    return [by_date[k] for k in sorted(by_date.keys())]


def _project_sleep(
    conn: sqlite3.Connection, start: str, end: str
) -> list[dict[str, Any]]:
    if not _table_exists(conn, "sleep"):
        return []

    rows = conn.execute(
        """
        SELECT *
        FROM sleep
        WHERE calendar_date >= ? AND calendar_date <= ?
        ORDER BY start_ts
        """,
        (start, end),
    ).fetchall()

    levels_by_sleep: dict[int, list[sqlite3.Row]] = {}
    if rows and _table_exists(conn, "sleep_level"):
        sleep_ids = [r["sleep_id"] for r in rows]
        placeholders = ",".join("?" * len(sleep_ids))
        for lvl in conn.execute(
            f"""
            SELECT sleep_id, start_ts, end_ts, stage, stage_label
            FROM sleep_level
            WHERE sleep_id IN ({placeholders})
            ORDER BY start_ts
            """,
            sleep_ids,
        ):
            levels_by_sleep.setdefault(int(lvl["sleep_id"]), []).append(lvl)

    out: list[dict[str, Any]] = []
    for r in rows:
        stages: list[dict[str, Any]] = []
        for lvl in levels_by_sleep.get(int(r["sleep_id"]), []):
            label = lvl["stage_label"]
            if isinstance(label, str) and label:
                stage_type = SLEEP_STAGE_MAP.get(label.upper(), label.lower())
            else:
                stage_type = SLEEP_STAGE_MAP.get(lvl["stage"], "unknown")
            start_ts = _iso(lvl["start_ts"])
            end_ts = _iso(lvl["end_ts"])
            duration = None
            if start_ts and end_ts:
                try:
                    duration = int(
                        (
                            datetime.fromisoformat(end_ts.replace("Z", "+00:00"))
                            - datetime.fromisoformat(start_ts.replace("Z", "+00:00"))
                        ).total_seconds()
                    )
                except ValueError:
                    duration = None
            stages.append(
                {
                    "stage_type": stage_type,
                    "start_time": start_ts,
                    "end_time": end_ts,
                    "duration_in_seconds": duration,
                }
            )

        deep = _num(r["deep_sleep_seconds"]) or 0
        light = _num(r["light_sleep_seconds"]) or 0
        rem = _num(r["rem_sleep_seconds"]) or 0
        time_asleep = deep + light + rem
        duration_in_seconds = _num(r["sleep_time_seconds"])
        if duration_in_seconds is None and time_asleep:
            duration_in_seconds = time_asleep + (_num(r["awake_sleep_seconds"]) or 0)

        out.append(
            {
                "entry_date": _as_date_str(r["calendar_date"]),
                "bedtime": _iso(r["start_ts"]),
                "wake_time": _iso(r["end_ts"]),
                "duration_in_seconds": duration_in_seconds,
                "time_asleep_in_seconds": time_asleep or None,
                "sleep_score": _num(r["score_overall_value"]),
                "deep_sleep_seconds": _num(r["deep_sleep_seconds"]),
                "light_sleep_seconds": _num(r["light_sleep_seconds"]),
                "rem_sleep_seconds": _num(r["rem_sleep_seconds"]),
                "awake_sleep_seconds": _num(r["awake_sleep_seconds"]),
                "avg_overnight_hrv": _num(r["avg_overnight_hrv"]),
                "resting_heart_rate": _num(r["resting_heart_rate"]),
                "average_spo2_value": _num(r["average_spo2"]),
                "stages": stages,
            }
        )
    return out


def _activity_laps(
    conn: sqlite3.Connection, activity_id: int
) -> list[dict[str, Any]]:
    if not _table_exists(conn, "activity_lap_metric"):
        return []
    rows = conn.execute(
        """
        SELECT lap_idx, name, value, units
        FROM activity_lap_metric
        WHERE activity_id = ?
        ORDER BY lap_idx, name
        """,
        (activity_id,),
    ).fetchall()
    by_lap: dict[int, dict[str, Any]] = {}
    for r in rows:
        lap = by_lap.setdefault(int(r["lap_idx"]), {"lap_index": int(r["lap_idx"])})
        lap[str(r["name"])] = _num(r["value"])
        if r["units"]:
            lap[f"{r['name']}_units"] = r["units"]
    return [by_lap[k] for k in sorted(by_lap.keys())]


def _activity_gps(
    conn: sqlite3.Connection, activity_id: int
) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []

    if _table_exists(conn, "activity_ts_metric"):
        rows = conn.execute(
            """
            SELECT timestamp, name, value
            FROM activity_ts_metric
            WHERE activity_id = ?
              AND name IN (
                    'position_lat', 'position_long', 'position_lon',
                    'heart_rate', 'cadence', 'enhanced_speed', 'speed',
                    'altitude', 'enhanced_altitude'
              )
            ORDER BY timestamp
            """,
            (activity_id,),
        ).fetchall()
        by_ts: dict[str, dict[str, Any]] = {}
        for r in rows:
            ts = _iso(r["timestamp"])
            if not ts:
                continue
            bucket = by_ts.setdefault(ts, {"t": ts})
            name = r["name"]
            val = _num(r["value"])
            if name == "position_lat":
                bucket["lat"] = val
            elif name in ("position_long", "position_lon"):
                bucket["lon"] = val
            elif name == "heart_rate":
                bucket["hr"] = val
            elif name == "cadence":
                bucket["cad"] = val
            elif name in ("enhanced_speed", "speed"):
                bucket["speed"] = val
            elif name in ("altitude", "enhanced_altitude"):
                bucket["alt"] = val
        for ts in sorted(by_ts.keys()):
            p = by_ts[ts]
            if p.get("lat") is not None and p.get("lon") is not None:
                points.append(p)

    if not points and _table_exists(conn, "activity_path"):
        row = conn.execute(
            "SELECT path_json FROM activity_path WHERE activity_id = ?",
            (activity_id,),
        ).fetchone()
        if row and row["path_json"]:
            try:
                path = json.loads(row["path_json"])
            except json.JSONDecodeError:
                path = []
            for pair in path:
                if isinstance(pair, (list, tuple)) and len(pair) >= 2:
                    points.append(
                        {"t": None, "lat": _num(pair[1]), "lon": _num(pair[0])}
                    )

    return _downsample(points)


def _project_activities(
    conn: sqlite3.Connection, start: str, end: str
) -> list[dict[str, Any]]:
    if not _table_exists(conn, "activity"):
        return []

    # Expand UTC window by ±1 day so evening local activities near range edges
    # are still candidates; filter by local calendar day below.
    rows = conn.execute(
        """
        SELECT *
        FROM activity
        WHERE date(start_ts) >= date(?, '-1 day')
          AND date(start_ts) <= date(?, '+1 day')
        ORDER BY start_ts
        """,
        (start, end),
    ).fetchall()

    skip_detail = {
        "activity_id",
        "user_id",
        "activity_name",
        "activity_type_key",
        "start_ts",
        "duration",
        "distance",
        "calories",
        "average_hr",
        "max_hr",
    }
    out: list[dict[str, Any]] = []
    for r in rows:
        offset = r["timezone_offset_hours"] if "timezone_offset_hours" in r.keys() else None
        local_day = _local_date_str(r["start_ts"], offset)
        if not local_day or local_day < start or local_day > end:
            continue

        activity_id = int(r["activity_id"])
        duration_sec = _num(r["duration"])
        duration_minutes = (
            round(float(duration_sec) / 60.0, 4) if duration_sec is not None else None
        )
        distance_m = _num(r["distance"])
        distance_km = (
            round(float(distance_m) / 1000.0, 6) if distance_m is not None else None
        )
        detail_data = {
            k: r[k] for k in r.keys() if k not in skip_detail and r[k] is not None
        }
        # Prefer local wall clock (Connect startTimeLocal equivalent) for Sparky
        # diary entry_date / entry_time. Keep UTC start in detail_data.
        local_start = _local_wall_clock(r["start_ts"], offset)
        detail_data["start_ts_utc"] = _iso(r["start_ts"])
        if offset is not None:
            detail_data["timezone_offset_hours"] = offset
        out.append(
            {
                "activity_id": str(activity_id),
                "name": r["activity_name"] or r["activity_type_key"] or "",
                "activity_type": r["activity_type_key"] or "",
                "start_time": local_start,
                "duration_minutes": duration_minutes,
                "distance_km": distance_km,
                "calories": _num(r["calories"]),
                "avg_heart_rate": _num(r["average_hr"]),
                "max_heart_rate": _num(r["max_hr"]),
                "steps": None,
                "laps": _activity_laps(conn, activity_id),
                "gps_points": _activity_gps(conn, activity_id),
                "detail_data": detail_data,
            }
        )
    return out


def _project_body_composition(
    conn: sqlite3.Connection, start: str, end: str
) -> list[dict[str, Any]]:
    if not _table_exists(conn, "body_composition"):
        return []
    rows = conn.execute(
        """
        SELECT *
        FROM body_composition
        WHERE date(timestamp) >= ? AND date(timestamp) <= ?
        ORDER BY timestamp
        """,
        (start, end),
    ).fetchall()
    out: list[dict[str, Any]] = []
    for r in rows:
        weight_g = _num(r["weight"])
        bone_g = _num(r["bone_mass"])
        muscle_g = _num(r["muscle_mass"])
        out.append(
            {
                "date": _as_date_str(r["timestamp"]),
                "weight_kg": (
                    round(weight_g / 1000.0, 3) if weight_g is not None else None
                ),
                "bmi": _num(r["bmi"]),
                "body_fat_percentage": _num(r["body_fat"]),
                "muscle_mass_kg": (
                    round(muscle_g / 1000.0, 3) if muscle_g is not None else None
                ),
                "bone_mass_kg": (
                    round(bone_g / 1000.0, 3) if bone_g is not None else None
                ),
                "body_water_percentage": _num(r["body_water"]),
            }
        )
    return out


def _sample_series(
    conn: sqlite3.Connection,
    table: str,
    value_key: str,
    start: str,
    end: str,
    value_filter_sql: str = "value IS NOT NULL",
) -> list[dict[str, Any]]:
    if not _table_exists(conn, table):
        return []
    rows = conn.execute(
        f"""
        SELECT date(timestamp) AS d, timestamp, value
        FROM {table}
        WHERE date(timestamp) >= ? AND date(timestamp) <= ?
          AND ({value_filter_sql})
        ORDER BY timestamp
        """,
        (start, end),
    ).fetchall()
    by_date: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        day = r["d"]
        if not day:
            continue
        by_date.setdefault(day, []).append(
            {"t": _iso(r["timestamp"]), value_key: _num(r["value"])}
        )
    return [{"date": d, "points": by_date[d]} for d in sorted(by_date.keys())]


def _hrv_samples(
    conn: sqlite3.Connection, start: str, end: str
) -> list[dict[str, Any]]:
    if not _table_exists(conn, "hrv") or not _table_exists(conn, "sleep"):
        return []
    rows = conn.execute(
        """
        SELECT s.calendar_date AS d, h.timestamp, h.value
        FROM hrv h
        JOIN sleep s ON s.sleep_id = h.sleep_id
        WHERE s.calendar_date >= ? AND s.calendar_date <= ?
          AND h.value IS NOT NULL
        ORDER BY h.timestamp
        """,
        (start, end),
    ).fetchall()
    by_date: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        day = _as_date_str(r["d"])
        if not day:
            continue
        by_date.setdefault(day, []).append(
            {"t": _iso(r["timestamp"]), "rmssd_ms": _num(r["value"])}
        )
    return [{"date": d, "points": by_date[d]} for d in sorted(by_date.keys())]


def _spo2_samples(
    conn: sqlite3.Connection, start: str, end: str
) -> list[dict[str, Any]]:
    if not _table_exists(conn, "spo2") or not _table_exists(conn, "sleep"):
        return []
    rows = conn.execute(
        """
        SELECT s.calendar_date AS d, sp.timestamp, sp.value
        FROM spo2 sp
        JOIN sleep s ON s.sleep_id = sp.sleep_id
        WHERE s.calendar_date >= ? AND s.calendar_date <= ?
          AND sp.value IS NOT NULL
        ORDER BY sp.timestamp
        """,
        (start, end),
    ).fetchall()
    by_date: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        day = _as_date_str(r["d"])
        if not day:
            continue
        by_date.setdefault(day, []).append(
            {"t": _iso(r["timestamp"]), "percentage": _num(r["value"])}
        )
    return [{"date": d, "points": by_date[d]} for d in sorted(by_date.keys())]


def project_training(user_id: str, start_date: str, end_date: str) -> dict[str, Any]:
    """Build the stable training projection JSON for an inclusive date range."""
    db_path = user_db_path(user_id)
    if not db_path.exists():
        return {}

    start = date.fromisoformat(start_date).isoformat()
    end = date.fromisoformat(end_date).isoformat()

    conn = _connect(db_path)
    try:
        payload: dict[str, Any] = {}

        daily = _project_daily_metrics(conn, start, end)
        if daily:
            payload["daily_metrics"] = daily

        sleep = _project_sleep(conn, start, end)
        if sleep:
            payload["sleep"] = sleep

        activities = _project_activities(conn, start, end)
        if activities:
            payload["activities"] = activities

        body = _project_body_composition(conn, start, end)
        if body:
            payload["body_composition"] = body

        samples: dict[str, Any] = {}
        hr = _sample_series(conn, "heart_rate", "bpm", start, end)
        if hr:
            samples["heart_rate"] = hr
        stress = _sample_series(
            conn, "stress", "level", start, end, value_filter_sql="value >= 0"
        )
        if stress:
            samples["stress"] = stress
        bb = _sample_series(conn, "body_battery", "level", start, end)
        if bb:
            samples["body_battery"] = bb
        hrv = _hrv_samples(conn, start, end)
        if hrv:
            samples["hrv"] = hrv
        resp = _sample_series(conn, "respiration", "brpm", start, end)
        if resp:
            samples["respiration"] = resp
        spo2 = _spo2_samples(conn, start, end)
        if spo2:
            samples["spo2"] = spo2
        if samples:
            payload["samples"] = samples

        return payload
    finally:
        conn.close()
