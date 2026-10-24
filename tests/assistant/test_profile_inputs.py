"""metadata.profile 선호 확장(currency·interests·budget_krw·current_product) 입력 매핑 테스트."""

from __future__ import annotations

import pytest

from app.api.v1.inputs import HOME_REQUEST, home_request, profile_from_metadata
from app.graph.nodes import format_profile
from app.utils.errors import OpenAIError

BASE = {"language": "en-US", "country": "us", "gender": "female", "age_band": "25-34"}


def test_existing_fields_unchanged():
    assert profile_from_metadata({"profile": BASE}) == {"language": "en", "country": "US", "gender": "female", "age_band": "25-34"}


def test_preferences_are_validated_and_normalized():
    prof = profile_from_metadata({"profile": {**BASE, "currency": "usd", "interests": [" skincare ", "hair"],
                                              "budget_krw": 50000.0, "current_product": "  CeraVe Moisturizing Cream "}})
    assert prof["currency"] == "USD"
    assert prof["interests"] == ["skincare", "hair"]
    assert prof["budget_krw"] == 50000 and isinstance(prof["budget_krw"], int)
    assert prof["current_product"] == "CeraVe Moisturizing Cream"


def test_empty_preferences_are_omitted():
    prof = profile_from_metadata({"profile": {**BASE, "currency": "", "interests": [], "current_product": "   "}})
    assert set(prof) == {"language", "country", "gender", "age_band"}


@pytest.mark.parametrize("field,value", [
    ("currency", "US"), ("currency", 123), ("currency", "U$D"),
    ("interests", "skincare"), ("interests", ["x" * 41]), ("interests", [""]), ("interests", ["a"] * 11), ("interests", [1]),
    ("budget_krw", 0), ("budget_krw", -5), ("budget_krw", "50000"), ("budget_krw", True), ("budget_krw", 100_000_001),
    ("current_product", "x" * 201), ("current_product", ["CeraVe"]),
])
def test_invalid_preferences_raise_400(field, value):
    with pytest.raises(OpenAIError) as exc:
        profile_from_metadata({"profile": {**BASE, field: value}})
    assert exc.value.status_code == 400
    assert exc.value.param == f"metadata.profile.{field}"


def test_home_request_without_preferences_is_the_original_sentence():
    prof = {"country": "US", "language": "en"}
    assert home_request(prof) == HOME_REQUEST.format(country="US", language="en")


def test_home_request_adds_only_stated_preferences_and_no_gender_or_age():
    prof = profile_from_metadata({"profile": {**BASE, "interests": ["skincare"], "budget_krw": 50000, "current_product": "CeraVe Moisturizing Cream"}})
    text = home_request(prof)
    assert text.startswith(HOME_REQUEST.format(country="US", language="en"))
    assert "interests skincare; budget about KRW 50,000; currently uses CeraVe Moisturizing Cream" in text
    assert "female" not in text and "25-34" not in text


def test_format_profile_shows_preferences_for_respond():
    line = format_profile({"language": "en", "country": "US", "interests": ["skincare", "hair"], "budget_krw": 50000})
    assert "interests=skincare, hair" in line and "budget_krw=50000" in line and "current_product=not_given" in line
