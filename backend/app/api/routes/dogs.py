"""Dog routes: GET/POST /v1/dogs, PATCH /v1/dogs/{dog_id} (sez. 9)."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import StateDep, UserIdDep
from app.contracts.api import DogCreate, DogListResponse, DogOut, DogUpdate
from app.domains import dogs as dogs_domain
from app.domains.models import DogRec

router = APIRouter()


def to_out(dog: DogRec) -> DogOut:
    return DogOut(
        id=dog.id,
        name=dog.name,
        age_stage=dog.age_stage,
        size=dog.size,
        breed_label=dog.breed_label,
        is_mix=dog.is_mix,
        sex=dog.sex,
        weight_kg=dog.weight_kg,
        photo_path=dog.photo_path,
        created_at=dog.created_at,
    )


@router.get("/dogs", response_model=DogListResponse)
async def list_dogs(state: StateDep, user_id: UserIdDep) -> DogListResponse:
    return DogListResponse(items=[to_out(d) for d in state.store.list_dogs(user_id)])


@router.post("/dogs", response_model=DogOut, status_code=201)
async def create_dog(payload: DogCreate, state: StateDep, user_id: UserIdDep) -> DogOut:
    return to_out(dogs_domain.create_dog(state.store, user_id=user_id, payload=payload))


@router.patch("/dogs/{dog_id}", response_model=DogOut)
async def update_dog(dog_id: str, payload: DogUpdate, state: StateDep, user_id: UserIdDep) -> DogOut:
    return to_out(dogs_domain.update_dog(state.store, user_id=user_id, dog_id=dog_id, payload=payload))
