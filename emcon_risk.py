"""
emcon_risk.py

Compute and plot cumulative risk of an EMCON (emissions-control) bust during a ship transit.

Defaults:
 - EMCON_bust (daily probability) = 0.05
 - Ship_Speed = 40 km/hr
 - Ship_Distance = 1000 km

Outputs two PNG files saved in the working directory (or provided outdir):
 - emcon_risk_timeseries.png : line plot of cumulative risk vs time (days)
 - emcon_risk_final.png : final overall cumulative risk (large annotation)

Usage examples:
 python emcon_risk.py
 python emcon_risk.py --emcon 0.02 --speed 30 --distance 2000 --outdir "./outputs"
"""

import os
import argparse
import math
import numpy as np
import matplotlib.pyplot as plt


def cumulative_risk_from_daily_prob(p_daily, days):
    """
    Compute cumulative probability of at least one event in `days` days
    assuming independent daily probability `p_daily`.

    For fractional days this uses the continuous equivalent:
      P = 1 - (1 - p_daily) ** days
    which is equivalent to P = 1 - exp(-lambda * days) with
      lambda = -ln(1 - p_daily)
    """
    if p_daily <= 0:
        return 0.0
    if p_daily >= 1:
        return 1.0
    return 1.0 - (1.0 - p_daily) ** (days)


def run(emcon=0.05, speed_kmph=40.0, distance_km=1000.0, outdir=None, points=1000):
    # compute travel time in hours and days
    if speed_kmph <= 0:
        raise ValueError("Ship speed must be > 0 km/hr")
    travel_hours = distance_km / speed_kmph
    travel_days = travel_hours / 24.0

    # time vector from 0 to travel_days
    t = np.linspace(0.0, travel_days, points)

    # cumulative risk at each t
    cum_risk = np.array([cumulative_risk_from_daily_prob(emcon, days) for days in t])

    # prepare output directory
    outdir = outdir or os.getcwd()
    os.makedirs(outdir, exist_ok=True)

    # timeseries plot
    fig1, ax1 = plt.subplots(figsize=(8, 5))
    ax1.plot(t, cum_risk, lw=2)
    ax1.set_xlabel('Time (days)')
    ax1.set_ylabel('Cumulative probability of EMCON-bust')
    ax1.set_title(f'Cumulative detection risk during transit\n(emcon={emcon:.3f} daily, speed={speed_kmph} km/hr, distance={distance_km} km)')
    ax1.grid(alpha=0.3)

    timeseries_path = os.path.join(outdir, 'emcon_risk_timeseries.png')
    fig1.tight_layout()
    fig1.savefig(timeseries_path, dpi=200)

    # final plot showing overall cumulative risk
    final_prob = cum_risk[-1]
    fig2, ax2 = plt.subplots(figsize=(6, 4))
    ax2.bar([0], [final_prob], color='#1f77b4')
    ax2.set_ylim(0, 1)
    ax2.set_xticks([])
    ax2.set_ylabel('Probability')
    ax2.set_title('Overall cumulative probability of EMCON-bust during transit')
    ax2.text(0, final_prob + 0.03 if final_prob < 0.95 else final_prob - 0.08,
             f'{final_prob*100:.2f}% over {travel_days:.2f} days',
             ha='center', va='bottom' if final_prob < 0.95 else 'top', fontsize=12, fontweight='bold')

    final_path = os.path.join(outdir, 'emcon_risk_final.png')
    fig2.tight_layout()
    fig2.savefig(final_path, dpi=200)

    # show plots interactively if running in an environment with display
    try:
        plt.show()
    except Exception:
        # headless environment; just continue
        pass

    print('Saved:', timeseries_path)
    print('Saved:', final_path)
    print(f'Final cumulative risk = {final_prob:.6f} ({final_prob*100:.2f}%)')

    return {
        't_days': t,
        'cum_risk': cum_risk,
        'timeseries_path': timeseries_path,
        'final_path': final_path,
        'final_prob': final_prob,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='EMCON bust cumulative risk during ship transit')
    parser.add_argument('--emcon', type=float, default=0.05, help='daily probability of EMCON bust (default 0.05)')
    parser.add_argument('--speed', type=float, default=40.0, help='ship speed in km/hr (default 40)')
    parser.add_argument('--distance', type=float, default=1000.0, help='ship distance in km (default 1000)')
    parser.add_argument('--outdir', type=str, default=None, help='output directory to save PNGs (default: current dir)')
    parser.add_argument('--points', type=int, default=1000, help='number of points in timeseries (default 1000)')

    args = parser.parse_args()
    run(emcon=args.emcon, speed_kmph=args.speed, distance_km=args.distance, outdir=args.outdir, points=args.points)
