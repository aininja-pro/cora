from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

# Only load .env in development
if os.getenv("APP_ENV") != "production":
    from dotenv import load_dotenv
    load_dotenv()

from .routes import synthflow, agent, voice, synthflow_action, synthflow_simple, synthflow_debug, synthflow_catch_all

app = FastAPI(
    title="CORA API",
    description="AI Voice Assistant for Real Estate Agents",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://192.168.1.81:5173", "https://api.synthflow.ai", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(synthflow.router)
app.include_router(synthflow_action.router)
app.include_router(synthflow_simple.router)
app.include_router(synthflow_debug.router)
app.include_router(synthflow_catch_all.router)
app.include_router(agent.router)
app.include_router(voice.router)

@app.get("/")
async def root():
    return {"message": "Welcome to CORA API"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}