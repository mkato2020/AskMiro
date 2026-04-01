"""
london_routing.py — Borough clustering + route planning for London-first targeting
Provides:
  - Borough cluster definitions (inner/outer rings, quadrants)
  - Postcode district density scoring
  - Daily route suggestions (geographically compact sets of leads)
"""

from __future__ import annotations

import math
from typing import Optional

import db_pg
import config


# ------------------------------------------------------------------
# Borough clusters — define visitable zones for route planning
# ------------------------------------------------------------------

BOROUGH_CLUSTERS = {
    'City & East': [
        'City of London', 'Tower Hamlets', 'Hackney', 'Islington',
        'Newham', 'Waltham Forest', 'Redbridge',
    ],
    'South Central': [
        'Southwark', 'Lambeth', 'Lewisham', 'Greenwich',
    ],
    'West Central': [
        'Westminster', 'Kensington and Chelsea', 'Hammersmith and Fulham',
        'Wandsworth',
    ],
    'North': [
        'Camden', 'Haringey', 'Barnet', 'Enfield',
    ],
    'West': [
        'Ealing', 'Hounslow', 'Richmond upon Thames', 'Hillingdon', 'Brent',
    ],
    'South': [
        'Merton', 'Sutton', 'Croydon', 'Bromley',
    ],
    'East': [
        'Barking and Dagenham', 'Havering', 'Bexley', 'Kingston upon Thames',
    ],
    'North West': [
        'Harrow', 'Brent',
    ],
}

# Reverse map: borough → cluster
BOROUGH_TO_CLUSTER: dict[str, str] = {}
for cluster_name, boroughs in BOROUGH_CLUSTERS.items():
    for borough in boroughs:
        BOROUGH_TO_CLUSTER[borough] = cluster_name


# ------------------------------------------------------------------
# Postcode-level density metrics
# ------------------------------------------------------------------

def get_density_by_district(conn) -> list[dict]:
    """
    Return postcode districts ranked by entity density and average score.
    Useful for identifying the most concentrated high-value areas.
    """
    rows = db_pg.fetchall(conn, """
        SELECT
            SPLIT_PART(a.postcode, ' ', 1)            AS district,
            a.borough,
            COUNT(e.id)                               AS entity_count,
            ROUND(AVG(os.total_score)::NUMERIC, 1)    AS avg_score,
            COUNT(e.id) FILTER (WHERE e.hvt = TRUE)   AS hvt_count,
            SUM(os.estimated_monthly_value_gbp)        AS total_value_gbp
        FROM entities e
        JOIN entity_locations el ON el.entity_id = e.id AND el.is_primary = TRUE
        JOIN addresses a ON a.id = el.address_id
        LEFT JOIN opportunity_scores os ON os.entity_id = e.id
        WHERE e.active = TRUE
          AND a.postcode IS NOT NULL
          AND a.postcode != ''
        GROUP BY SPLIT_PART(a.postcode, ' ', 1), a.borough
        HAVING COUNT(e.id) >= 3
        ORDER BY avg_score DESC, entity_count DESC
        LIMIT 100
    """)
    return [dict(r) for r in rows]


# ------------------------------------------------------------------
# Route suggestion: compact geographical clusters
# ------------------------------------------------------------------

def suggest_daily_route(
    conn,
    cluster: str,
    max_leads: int = 8,
    min_score: int = 60,
) -> list[dict]:
    """
    Return a set of high-scoring leads within a borough cluster,
    suitable for a day's visit route.
    Ordered by score DESC (simplified — proper TSP routing requires maps API).
    """
    boroughs = BOROUGH_CLUSTERS.get(cluster, [])
    if not boroughs:
        return []

    rows = db_pg.fetchall(conn, """
        SELECT vl.*
        FROM v_lead_board vl
        WHERE vl.active = TRUE
          AND vl.borough = ANY(%s)
          AND vl.total_score >= %s
          AND vl.opportunity_id IS NULL  -- not already in pipeline
          AND vl.latitude IS NOT NULL
          AND vl.longitude IS NOT NULL
        ORDER BY vl.total_score DESC
        LIMIT %s
    """, (boroughs, min_score, max_leads))

    return [dict(r) for r in rows]


def route_clusters_summary(conn) -> list[dict]:
    """
    Summarise each cluster: entity count, avg score, total pipeline value.
    """
    results = []
    for cluster_name, boroughs in BOROUGH_CLUSTERS.items():
        row = db_pg.fetchone(conn, """
            SELECT
                COUNT(DISTINCT e.id)                        AS entity_count,
                ROUND(AVG(os.total_score)::NUMERIC, 1)      AS avg_score,
                COUNT(DISTINCT o.id)                        AS pipeline_count,
                SUM(os.estimated_monthly_value_gbp)         AS total_value_gbp
            FROM entities e
            JOIN entity_locations el ON el.entity_id = e.id AND el.is_primary = TRUE
            JOIN addresses a ON a.id = el.address_id
            LEFT JOIN opportunity_scores os ON os.entity_id = e.id
            LEFT JOIN opportunities o ON o.entity_id = e.id
            WHERE e.active = TRUE AND a.borough = ANY(%s)
        """, (boroughs,))

        results.append({
            'cluster':        cluster_name,
            'boroughs':       boroughs,
            'entity_count':   int(row['entity_count'] or 0),
            'avg_score':      float(row['avg_score'] or 0),
            'pipeline_count': int(row['pipeline_count'] or 0),
            'total_value_gbp': int(row['total_value_gbp'] or 0),
        })

    return sorted(results, key=lambda x: x['avg_score'], reverse=True)


def borough_priority_rank(conn) -> list[dict]:
    """
    Rank all London boroughs by opportunity score and pipeline value.
    Combines entity quality with proximity to priority areas.
    """
    rows = db_pg.fetchall(conn, "SELECT * FROM v_borough_summary ORDER BY avg_score DESC NULLS LAST")
    result = []
    for r in rows:
        d = dict(r)
        # Add cluster info
        d['cluster'] = BOROUGH_TO_CLUSTER.get(d.get('borough', ''), 'Other')
        d['is_priority'] = d.get('borough') in config.PRIORITY_BOROUGHS
        result.append(d)
    return result


# ------------------------------------------------------------------
# Haversine distance helper (km between two lat/lon points)
# ------------------------------------------------------------------

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def nearest_leads(
    conn,
    lat: float,
    lon: float,
    radius_km: float = 2.0,
    min_score: int = 55,
    limit: int = 20,
) -> list[dict]:
    """
    Find high-scoring leads within radius_km of a coordinate.
    Haversine filtering done in Python after a coarse postcode-district pre-filter.
    """
    rows = db_pg.fetchall(conn, """
        SELECT vl.*
        FROM v_lead_board vl
        WHERE vl.active = TRUE
          AND vl.total_score >= %s
          AND vl.latitude IS NOT NULL
          AND vl.longitude IS NOT NULL
        ORDER BY vl.total_score DESC
        LIMIT 2000
    """, (min_score,))

    nearby = []
    for row in rows:
        dist = haversine_km(lat, lon, float(row['latitude']), float(row['longitude']))
        if dist <= radius_km:
            d = dict(row)
            d['distance_km'] = round(dist, 2)
            nearby.append(d)

    nearby.sort(key=lambda x: (x['distance_km'], -x['total_score']))
    return nearby[:limit]
