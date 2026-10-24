"""discovery 응답의 언어 선택. 현재 지원: 영어(기본)·한국어.

카탈로그 정본(영어)은 그대로 두고, 한국어는 별도 파일(discovery_catalog_ko.json)에서 항목 id·출처 URL 로 덮어쓴다.
서버가 만드는 문장은 아래 MESSAGES 표에서 고른다. 영어 문장은 기존 응답과 같은 문자열이다.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.schemas.discovery import Catalog, CatalogItem, Source
from app.utils.logger import AGENT_LOGGER_NAME

logger = logging.getLogger(AGENT_LOGGER_NAME)

Lang = Literal["en", "ko"]

DEFAULT_KO_PATH = Path(__file__).resolve().parents[1] / "data" / "discovery_catalog_ko.json"
KO_PATH_ENV = "DISCOVERY_CATALOG_KO_PATH"


def ui_lang(language: str | None) -> Lang:
    """BCP 47 태그에서 응답 언어를 고른다. ko, ko-KR 등은 한국어, 나머지는 영어."""
    return "ko" if (language or "").strip().lower().split("-")[0] == "ko" else "en"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class KoItem(_Strict):
    title: str | None = Field(default=None, min_length=1)  # 공식 한국어 이름이 없으면 비워 영어 제목을 쓴다
    description: str
    reasons: list[str]


class KoBasis(_Strict):
    ingredients_basis: str | None = None
    price_basis: str | None = None


class KoCatalog(_Strict):
    language: Literal["ko"]
    provenance: str = Field(min_length=1)
    items: dict[str, KoItem]
    source_labels: dict[str, str] = Field(default_factory=dict)
    facts: dict[str, KoBasis] = Field(default_factory=dict)
    references: dict[str, KoBasis] = Field(default_factory=dict)
    forms: dict[str, str] = Field(default_factory=dict)
    list_price_basis: dict[str, str] = Field(default_factory=dict)  # 영어 원문 → 한국어(같은 문장이 여러 항목에 반복된다)


def ko_path() -> Path:
    return Path(os.environ.get(KO_PATH_ENV) or DEFAULT_KO_PATH)


def load_ko() -> KoCatalog:
    # discovery.py 가 이 모듈의 msg 를 쓰므로 순환 import 를 피해 여기서 가져온다
    from app.services.discovery import CatalogUnavailable

    path = ko_path()
    try:
        return KoCatalog.model_validate(json.loads(path.read_text(encoding="utf-8")))
    except FileNotFoundError as exc:
        raise CatalogUnavailable(f"Korean catalog file not found: {path.name}") from exc
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise CatalogUnavailable(f"Korean catalog is not valid JSON: {path.name}") from exc
    except ValidationError as exc:
        first = exc.errors()[0]
        loc = ".".join(str(p) for p in first["loc"])
        raise CatalogUnavailable(f"{path.name} violates contract at {loc}: {first['msg']}") from exc


def localize_source(src: Source, ko: KoCatalog | None) -> Source:
    if ko is None or src.url not in ko.source_labels:
        return src
    return src.model_copy(update={"label": ko.source_labels[src.url]})


def localize_item(item: CatalogItem, ko: KoCatalog | None) -> CatalogItem:
    if ko is None:
        return item
    entry = ko.items.get(item.id)
    sources = [localize_source(s, ko) for s in item.sources]
    list_price = item.list_price
    if list_price is not None:
        list_price = list_price.model_copy(update={
            "basis": ko.list_price_basis.get(list_price.basis, list_price.basis),
            "source": localize_source(list_price.source, ko),
        })
    if entry is None or len(entry.reasons) != len(item.reasons):
        # 표시 경로의 폴백: 영어를 그대로 쓰되 누락을 로그로 드러낸다(커버리지 테스트가 막는다)
        logger.warning(f"[Discovery] ⚠️ Korean text missing or out of date for {item.id}; showing English")
        return item.model_copy(update={"sources": sources, "list_price": list_price})
    return item.model_copy(update={
        "title": entry.title or item.title,
        "description": entry.description,
        "reasons": list(entry.reasons),
        "sources": sources,
        "list_price": list_price,
    })


def ko_for(lang: Lang) -> KoCatalog | None:
    return load_ko() if lang == "ko" else None


def localize_catalog(catalog: Catalog, lang: Lang) -> Catalog:
    ko = ko_for(lang)
    if ko is None:
        return catalog
    return Catalog(items=[localize_item(i, ko) for i in catalog.items])


def form_label(form: str | None, ko: KoCatalog | None) -> str | None:
    if form is None or ko is None:
        return form
    return ko.forms.get(form.strip().casefold(), form)


# 서버가 만드는 문장. 키는 이 표 안에서만 쓰고, 영어는 기존 응답 문자열과 같다.
MESSAGES: dict[Lang, dict[str, str]] = {
    "en": {
        # 추천(discovery.py)
        "reco.price_unlisted": "Price not listed in our sources, so it was not checked against your budget.",
        "reco.list_price": "Seller lists {currency} {amount}. A Korean store price is not confirmed, so it was not compared with your KRW budget.",
        "reco.within_budget": "Listed price ₩{price} is within your budget of ₩{budget}.",
        "reco.interests": "Matches your interests: {hits}.",
        "reco.shares_words": "Shares words with your current product: {words}.",
        "reco.country_sources": "Our sources link this to {country}: {labels}.",
        "reco.supported": "{n} of {total} results have sources connected to {country}. "
        "Other results come from general sources. Your country is not used to guess skin type or treatment suitability.",
        "reco.insufficient": "We have no sourced information specific to {country} yet, so these results come from general sources. "
        "Your country is not used to guess skin type or treatment suitability.",
        # 비교(discovery_compare.py)
        "cmp.notice": "This compares label information only (listed ingredients, size, listed price) from the linked pages. "
        "It does not mean the products work the same way or are clinically equivalent. Check the package before buying.",
        "cmp.no_label_info": "No label information recorded for this candidate yet.",
        "cmp.ing_missing": "Listed ingredients are not recorded for one of the products.",
        "cmp.ing_common": "Both labels list these ingredient names. Amounts and formulas are not compared.",
        "cmp.ing_diff": "Listed on one label but not on the other's full ingredient list.",
        "cmp.ing_partial": "At least one list is partial, so an ingredient missing here may still be in the product.",
        "cmp.attr_form": "Product form",
        "cmp.attr_volume": "Size (ml)",
        "cmp.scalar_missing": "{label} is not recorded for one of the products.",
        "cmp.scalar_same": "Same {label_lower} on both pages.",
        "cmp.scalar_diff": "Different {label_lower} on the pages.",
        "cmp.price_missing": "A listed price is missing for one of the products.",
        "cmp.price_currency": "Prices are in different currencies and are shown as listed, without conversion.",
        "cmp.price_no_size": "Same currency, but a size is missing, so price per ml is not compared.",
        "cmp.price_diff_size": "Same currency but different sizes, so listed prices are not compared.",
        "cmp.price_same": "Same currency and same size. Prices are listed values and may change.",
        "cmp.country_ref": "The {brand} details come from its official page for {country}.",
        "cmp.country_item": "Our sources link this candidate to {country}: {labels}.",
        "cmp.country_tail": " Your country is not used to guess skin type, preferences or treatment suitability.",
        "cmp.country_none": "We have no sourced purchase or product information specific to {country} for this comparison.",
        # 비교 요약(discovery_explain.py)
        "exp.no_match": "We could not match your current product, so only {title}'s listed details are shown.",
        "exp.both_ingredients": "Both labels list {names}.",
        "exp.both_form": "Both are a {form}.",
        "exp.both_volume": "Both are {ml} ml.",
        "exp.cur_only": "Listed for your current product but not in {title}'s full list: {names}.",
        "exp.cand_only": "Listed for {title} but not in your current product's full list: {names}.",
        "exp.form_diff": "Forms differ: {cur} vs {cand}.",
        "exp.volume_diff": "Sizes differ: {cur} ml vs {cand} ml.",
        "exp.partial": "Some ingredients could not be checked because an ingredient list is partial or missing.",
        "exp.prices_not_compared": "Listed prices are {cur} and {cand}, shown as listed and are not compared.",
        "exp.prices_same_size": "Listed prices are {cur} and {cand}, shown as listed for the same size.",
        "exp.cand_price": "{title} is listed at {price}.",
        "exp.budget_within": "Its listed price is within your budget of KRW {budget}.",
        "exp.budget_above": "Its listed price is above your budget of KRW {budget}.",
        "exp.no_details": "Label details for {title} are not recorded yet.",
    },
    "ko": {
        "reco.price_unlisted": "출처에 가격이 없어 예산과 비교하지 않았어요.",
        "reco.list_price": "판매처 표시가는 {currency} {amount}예요. 국내 원화 가격은 확인되지 않아 원화 예산과 비교하지 않았어요.",
        "reco.within_budget": "표시 가격(₩{price})이 예산(₩{budget}) 안이에요.",
        "reco.interests": "관심사와 일치해요: {hits}.",
        "reco.shares_words": "지금 쓰는 제품과 겹치는 단어가 있어요: {words}.",
        "reco.country_sources": "{country} 관련 출처: {labels}.",
        "reco.supported": "결과 {total}개 중 {n}개에 {country} 관련 출처가 있어요. "
        "나머지는 일반 출처 기반이에요. 국가 정보로 피부 타입이나 시술 적합성을 추측하지 않아요.",
        "reco.insufficient": "아직 {country}에 해당하는 출처 정보가 없어 일반 출처 기반으로 보여드려요. "
        "국가 정보로 피부 타입이나 시술 적합성을 추측하지 않아요.",
        "cmp.notice": "링크된 페이지의 표시 정보(표기 성분, 용량, 표시 가격)만 비교해요. "
        "두 제품의 효과가 같거나 임상적으로 동등하다는 뜻이 아니에요. 구매 전에 포장을 확인하세요.",
        "cmp.no_label_info": "이 후보의 표시 정보가 아직 기록되지 않았어요.",
        "cmp.ing_missing": "한쪽 제품의 표기 성분이 기록되지 않았어요.",
        "cmp.ing_common": "두 라벨 모두 이 성분명을 표기해요. 함량과 배합은 비교하지 않아요.",
        "cmp.ing_diff": "한쪽 라벨에는 있지만 다른 쪽 전성분 목록에는 없어요.",
        "cmp.ing_partial": "적어도 한쪽 목록이 일부라서, 여기 없는 성분도 실제 제품에는 들어 있을 수 있어요.",
        "cmp.attr_form": "제형",
        "cmp.attr_volume": "용량(ml)",
        "cmp.scalar_missing": "한쪽 제품의 {label} 정보가 기록되지 않았어요.",
        "cmp.scalar_same": "두 페이지의 {label_lower} 정보가 같아요.",
        "cmp.scalar_diff": "두 페이지의 {label_lower} 정보가 달라요.",
        "cmp.price_missing": "한쪽 제품의 표시 가격이 없어요.",
        "cmp.price_currency": "통화가 달라 환산하지 않고 표시된 그대로 보여드려요.",
        "cmp.price_no_size": "통화는 같지만 용량 정보가 없어 ml당 가격은 비교하지 않아요.",
        "cmp.price_diff_size": "통화는 같지만 용량이 달라 표시 가격을 비교하지 않아요.",
        "cmp.price_same": "통화와 용량이 같아요. 가격은 표시된 값이며 바뀔 수 있어요.",
        "cmp.country_ref": "{brand} 정보는 {country} 공식 페이지에서 가져왔어요.",
        "cmp.country_item": "이 후보의 {country} 관련 출처: {labels}.",
        "cmp.country_tail": " 국가 정보로 피부 타입, 취향, 시술 적합성을 추측하지 않아요.",
        "cmp.country_none": "이 비교에는 {country}에 해당하는 구매·제품 출처 정보가 없어요.",
        "exp.no_match": "지금 쓰는 제품을 찾지 못해 {title}의 표시 정보만 보여드려요.",
        "exp.both_ingredients": "두 라벨에 모두 표기된 성분: {names}.",
        "exp.both_form": "두 제품 모두 {form} 제형이에요.",
        "exp.both_volume": "두 제품 모두 {ml}ml예요.",
        "exp.cur_only": "지금 쓰는 제품에는 표기돼 있지만 {title}의 전성분 목록에는 없어요: {names}.",
        "exp.cand_only": "{title}에는 표기돼 있지만 지금 쓰는 제품의 전성분 목록에는 없어요: {names}.",
        "exp.form_diff": "제형이 달라요: {cur} / {cand}.",
        "exp.volume_diff": "용량이 달라요: {cur}ml / {cand}ml.",
        "exp.partial": "성분 목록이 일부이거나 없어서 확인하지 못한 성분이 있어요.",
        "exp.prices_not_compared": "표시 가격은 {cur}, {cand}이며 표시된 그대로 보여드릴 뿐 비교하지 않아요.",
        "exp.prices_same_size": "표시 가격은 {cur}, {cand}이며 같은 용량 기준으로 표시된 값이에요.",
        "exp.cand_price": "{title}의 표시 가격은 {price}예요.",
        "exp.budget_within": "표시 가격이 예산(KRW {budget}) 안이에요.",
        "exp.budget_above": "표시 가격이 예산(KRW {budget})을 넘어요.",
        "exp.no_details": "{title}의 표시 정보가 아직 기록되지 않았어요.",
    },
}


def msg(lang: Lang, key: str, **values: object) -> str:
    return MESSAGES[lang][key].format(**values)
