EMCON Risk Script

This small utility computes and plots the cumulative probability that an EMCON (emissions control) failure occurs during a ship transit.

Defaults:
 - daily EMCON-bust probability: 0.05
 - ship speed: 40 km/hr
 - ship distance: 1000 km

Files created by the script:
 - emcon_risk_timeseries.png : line plot of cumulative risk vs time (days)
 - emcon_risk_final.png : a single-panel graphic with the final cumulative risk annotated

Usage

Run with Python 3.8+ (recommended). Install dependencies from `requirements.txt` if needed.

Example:

python emcon_risk.py

Custom parameters:

python emcon_risk.py --emcon 0.02 --speed 30 --distance 2000 --outdir "./outputs"

Notes

The script treats `emcon` as a daily independent probability. For fractional days the script uses the continuous-form equivalent:

P(t) = 1 - (1 - p_daily)^{t}

which is numerically equivalent to an exponential hazard with rate lambda = -ln(1 - p_daily).

Outputs are saved to the current directory by default (or `--outdir` if provided).