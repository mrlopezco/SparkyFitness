import logging
import os

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI

from routes import router as ghd_router
from service import ensure_data_root

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()
PORT = int(os.getenv("GHD_SERVICE_PORT", "8001"))
logger.info("GHD service configured to run on port: %s", PORT)

ensure_data_root()

app = FastAPI(title="SparkyFitness GHD Microservice")
app.include_router(ghd_router)


@app.get("/")
async def read_root():
    return {"message": "Garmin Health Data microservice is running"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
