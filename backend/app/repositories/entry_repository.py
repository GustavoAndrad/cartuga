from sqlalchemy.orm import Session

from app.models.entry import Entry


def get(db: Session, user_id: int, entry_id: int) -> Entry | None:
    return db.query(Entry).filter(Entry.id == entry_id, Entry.user_id == user_id).first()


def list_all(db: Session, user_id: int) -> list[Entry]:
    return db.query(Entry).filter(Entry.user_id == user_id).order_by(Entry.date.desc()).all()


def create(db: Session, entry: Entry) -> Entry:
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def delete(db: Session, entry: Entry) -> None:
    db.delete(entry)
    db.commit()
