"""Nearby useful places (parks / vets)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query

from app.api.deps import UserIdDep
from app.contracts.api import NearbyPlacesResponse
from app.domains import places as places_domain

router = APIRouter()


@router.get("/places/nearby", response_model=NearbyPlacesResponse)
async def nearby_places(
    _user_id: UserIdDep,
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    kind: Literal["PARK", "VET"] | None = None,
    radius_m: int = Query(default=8000, ge=500, le=25000),
) -> NearbyPlacesResponse:
    return await places_domain.search_nearby(
        lat=lat, lng=lng, kind=kind, radius_m=radius_m
    )
