mkdir timekeeper-backend && cd timekeeper-backend
python -m venv venv
source venv/bin/activate
pip install fastapi uvicorn requests

# main.py
from fastapi import FastAPI
from pydantic import BaseModel
from datetime import datetime, timedelta

app = FastAPI()

class LogRequest(BaseModel):
    login: str
    logout: str
    breaks: list[list[str]]  # [["13:00", "13:30"], ["17:00", "17:15"]]

@app.post("/calculate")
def calculate_time(data: LogRequest):
    fmt = "%H:%M"
    login = datetime.strptime(data.login, fmt)
    logout = datetime.strptime(data.logout, fmt)

    break_total = sum([
        datetime.strptime(end, fmt) - datetime.strptime(start, fmt)
        for start, end in data.breaks
    ], timedelta())

    total = logout - login
    work_time = total - break_total
    required = timedelta(hours=8)
    remaining = required - work_time if work_time < required else timedelta()

    return {
        "login_time": data.login,
        "logout_time": data.logout,
        "total_break": str(break_total),
        "work_done": str(work_time),
        "remaining": str(remaining)
    }
