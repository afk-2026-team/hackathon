from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

# 계약 정본: docs/plan/plan_26102413_47_31_구글인증_연결.md "연결 계약". 필드 변경은 화면 auth 세션·컨트롤러와 먼저 조율한다.


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AuthConfig(_Strict):
    """브라우저 SDK 초기화용 공개 설정. 서버 비밀 키는 이 모델에 둘 자리가 없다."""

    supabase_url: str
    publishable_key: str
    google_enabled: bool
    callback_path: Literal["/auth/callback"] = "/auth/callback"


class AuthUser(_Strict):
    """Supabase /auth/v1/user 로 서버가 검증한 사용자 최소 정보."""

    id: str
    email: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
