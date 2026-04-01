"""run_weekly_targets.py — weekly target exports."""
import argparse, csv
from datetime import datetime
from config import EXPORTS_DIR
from database import init_db
from weekly_targets import immediate_opportunity_leads, strategic_multi_site_targets, route_cluster_targets, regulated_premium_targets
from logger_setup import setup_logging

def _export(name, rows):
    if not rows: print(f"No rows for {name}."); return None
    path=EXPORTS_DIR / f"{name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    with open(path,'w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f, fieldnames=rows[0].keys()); w.writeheader(); w.writerows(rows)
    return path

def main():
    p=argparse.ArgumentParser(description='AskMiro Weekly Targets')
    p.add_argument('--immediate', type=int, default=100); p.add_argument('--strategic', type=int, default=50); p.add_argument('--visit', type=int, default=50); p.add_argument('--regulated', type=int, default=25)
    args=p.parse_args(); setup_logging(); init_db()
    groups={'immediate_opportunity': immediate_opportunity_leads(args.immediate), 'strategic_multi_site': strategic_multi_site_targets(args.strategic), 'route_clusters': route_cluster_targets(args.visit), 'regulated_premium': regulated_premium_targets(args.regulated)}
    for name,rows in groups.items():
        print(f"\n{name}: {len(rows)} rows")
        path=_export(name, rows)
        if path: print(f"  exported → {path}")

if __name__=='__main__': main()
