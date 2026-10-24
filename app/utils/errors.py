from __future__ import annotations


class OpenAIError(Exception):
    """클라이언트에 OpenAI error envelope 로 돌려줄 계약 위반(spec §3.2)."""

    def __init__(self, status_code: int, message: str, type_: str, param: str | None = None, code: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.type = type_
        self.param = param
        self.code = code
