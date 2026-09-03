"""
Training Readiness Dashboard — FastAPI Recommendation Service

Start with:
    uvicorn main:app --reload --port 8000

Endpoint:
    POST /compute-recommendation
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import RecommendationRequest, RecommendationResponse
from rules import compute_recommendation

app = FastAPI(
    title="Training Readiness — Recommendation Engine",
    description="Deterministic rules-based daily training recommendation service.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "recommendation-engine", "version": "v1"}


@app.post("/compute-recommendation", response_model=RecommendationResponse)
def compute(request: RecommendationRequest) -> RecommendationResponse:
    """
    Accepts normalized daily metrics and returns a structured recommendation.

    The recommendation is purely deterministic — no ML, no LLM.
    """
    try:
        return compute_recommendation(request.metrics, request.training_mode)
    except Exception as exc:
        # Surface errors clearly rather than returning a silent 500
        raise HTTPException(status_code=500, detail=str(exc)) from exc
