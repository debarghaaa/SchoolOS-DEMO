from __future__ import annotations

import logging
from dataclasses import dataclass

from app.core.config import settings

log = logging.getLogger("schoolos.email")

QUEUED_CAP = 100


@dataclass
class Email:
    to: str
    subject: str
    body: str


# In-memory outbox (bounded). Lets tests assert delivery without an MTA;
# production should point EMAIL_BACKEND at SMTP/SES and keep this as a log.
outbox: list[Email] = []


def send_email(to: str, subject: str, body: str) -> None:
    email = Email(to=to, subject=subject, body=body)
    outbox.append(email)
    del outbox[:-QUEUED_CAP]
    if settings.EMAIL_BACKEND == "console":
        log.info("EMAIL to=%s subject=%s\n%s", to, subject, body)
    else:  # pragma: no cover - wire SMTP/SES here
        log.info("EMAIL (backend=%s) to=%s subject=%s", settings.EMAIL_BACKEND, to, subject)
