from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
from .routes import synthflow, agent, voice

# Load environment variables
load_dotenv()

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
app.include_router(agent.router)
app.include_router(voice.router)

@app.get("/")
async def root():
    return {"message": "Welcome to CORA API"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}