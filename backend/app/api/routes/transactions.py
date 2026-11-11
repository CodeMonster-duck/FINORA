from __future__ import annotations

from datetime import date as dt_date

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.connection import get_db
from app.models.user import User
from app.schemas.transaction import (
    TransactionCreate,
    TransactionListResponse,
    TransactionOut,
    TransactionUpdate,
)
from app.services.finance_service import (
    create_transaction,
    delete_transaction,
    export_transactions_csv,
    get_transaction_or_404,
    list_transactions,
    serialize_transaction,
    update_transaction,
)

router = APIRouter(prefix="/transactions", tags=["Transactions"])


@router.get("", response_model=TransactionListResponse)
def get_transactions(
    search: str | None = Query(default=None),
    type: str | None = Query(default=None, pattern="^(income|expense)$"),
    category: str | None = Query(default=None),
    start_date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end_date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    sort_by: str = Query(
        default="date-desc",
        pattern="^(date-desc|date-asc|amount-desc|amount-asc)$",
    ),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransactionListResponse:
    return list_transactions(
        db,
        current_user.id,
        search=search,
        tx_type=type,
        category=category,
        start_date=start_date,
        end_date=end_date,
        sort_by=sort_by,
        page=page,
        page_size=page_size,
    )


@router.post(
    "",
    response_model=TransactionOut,
    status_code=status.HTTP_201_CREATED,
)
def post_transaction(
    payload: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransactionOut:
    tx = create_transaction(db, current_user.id, payload)
    return serialize_transaction(tx)


@router.get("/export/csv")
def export_csv(
    type: str | None = Query(default=None, pattern="^(income|expense)$"),
    category: str | None = Query(default=None),
    start_date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end_date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    csv_body = export_transactions_csv(
        db,
        current_user.id,
        currency=current_user.currency,
        tx_type=type,
        category=category,
        start_date=start_date,
        end_date=end_date,
    )
    filename = f"finora-transactions-{dt_date.today().isoformat()}.csv"
    return Response(
        content=csv_body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{transaction_id}", response_model=TransactionOut)
def get_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransactionOut:
    tx = get_transaction_or_404(db, current_user.id, transaction_id)
    return serialize_transaction(tx)


@router.put("/{transaction_id}", response_model=TransactionOut)
def put_transaction(
    transaction_id: int,
    payload: TransactionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransactionOut:
    tx = update_transaction(db, current_user.id, transaction_id, payload)
    return serialize_transaction(tx)


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    delete_transaction(db, current_user.id, transaction_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
