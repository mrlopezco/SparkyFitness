# SparkyFitness GHD microservice
#
# FastAPI sidecar wrapping PyPI `garmin-health-data` (GHD). Per-user tokens and
# SQLite warehouses live under GHD_DATA_DIR (default /data).
#
# Local run (from this directory, with a venv recommended):
#   pip install -r requirements.txt
#   set GHD_DATA_DIR=./data
#   set GHD_SERVICE_PORT=8001
#   python main.py
#
# Endpoints:
#   GET  /health
#   POST /auth/login          {user_id, email, password}
#   POST /auth/resume_login   {user_id, mfa_id, mfa_code}
#   POST /auth/status         {user_id} -> {linked}
#   POST /extract             {user_id, start_date, end_date, data_types?}
#   GET  /projection/training?user_id=&start_date=&end_date=
#
# Never commit Garmin credentials. For local smoke tests, load GHD_TEST_EMAIL /
# GHD_TEST_PASSWORD from a gitignored .env.local only.
