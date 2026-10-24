import { useState } from 'react'
import type { DetailProps } from '../../screens/contracts'
import { fill, useLang, useT } from '../../lib/i18n'
import { CategoryBadge, Price, SponsorBadge, SubBar } from '../Common'
import { ComparePanel } from '../ComparePanel'
import { BlogReviews } from './BlogReviews'
import { VideoShelf } from './VideoShelf'
import { CartButton, HeroImage, Reasons, Sources, Tags, koreanName } from './parts'

// 뷰티 제품 상세(상품 상세 톤: 큰 이미지 → 이름·가격 → 블록 섹션 → 하단 고정 구매 바).
export function ProductDetail({ item, profile, onBack, onAddCart, onAddTrip, onOpenCart, onGoTrip, cartQty, inTrip, currentProduct, onSetCurrent }: DetailProps) {
  const t = useT()
  const lang = useLang()
  const ko = koreanName(item)
  const [copy, setCopy] = useState<'idle' | 'done' | 'fail'>('idle')

  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(item.subtitle)
      setCopy('done')
    } catch {
      setCopy('fail')
    }
  }

  return (
    <div className="dt-page">
      <SubBar title={item.title} onBack={onBack} actions={<CartButton count={cartQty} onOpen={onOpenCart} />} />
      <HeroImage item={item} />

      <section className="dt-head">
        <div className="dt-badges">
          <CategoryBadge category={item.category} />
          <SponsorBadge value={item.sponsorship} />
        </div>
        <h1 className="dt-title">{item.title}</h1>
        <Price krw={item.price_krw} list={item.list_price} currency={profile.currency} size="lg" />
      </section>

      <section className="dt-store" aria-labelledby="dt-store-h">
        <h2 id="dt-store-h" className="dt-store__h">{t('detail.storeTitle')}</h2>
        <p className="dt-store__lead">{t('detail.storeLead')}</p>
        <div className="dt-store__row">
          <p className="dt-store__name" lang="ko" data-testid="store-name">{item.subtitle}</p>
          <button type="button" className="btn btn--beauty btn--small" onClick={copyName}>
            {copy === 'done' ? t('detail.copied') : t('detail.copy')}
          </button>
        </div>
        {copy === 'fail' && <p className="small muted" role="status">{t('detail.copyFailed')}</p>}
        {copy === 'done' && <span className="sr-only" role="status">{t('detail.copied')}</span>}
      </section>

      <div className="divider" />
      {item.description && (
        <section className="dt-sec">
          <h2 className="dt-h2">{t('detail.about')}</h2>
          <p className="dt-body">{item.description}</p>
          <Tags tags={item.tags} />
        </section>
      )}
      <Reasons reasons={item.reasons} />
      <div className="divider" />
      {/* 지금 쓰는 제품과 표시사항(성분·용량·가격) 비교 — 팀 비교 API(/v1/discovery/compare·explain) */}
      <div className="compare-wrap">
        <ComparePanel profile={profile} item={item} currentName={currentProduct} onSetCurrent={onSetCurrent} />
      </div>
      <div className="divider" />
      <VideoShelf query={lang === 'en' ? `${item.title} review` : ko} lang={lang} />
      <div className="divider" />
      <BlogReviews query={ko} lang={lang} />
      <div className="divider" />
      <Sources item={item} />

      <div className="dt-bar">
        <button
          type="button"
          className={`btn btn--lg dt-bar__sub ${inTrip ? 'btn--ghost dt-bar__sub--on' : 'btn--ghost'}`}
          onClick={() => (inTrip ? onGoTrip() : onAddTrip(item))}
        >
          {inTrip ? t('detail.inTrip') : t('detail.addTrip')}
        </button>
        <button type="button" className="btn btn--lg btn--beauty dt-bar__main" onClick={() => onAddCart(item)}>
          {t('detail.addCart')}
          {cartQty > 0 && <span className="dt-bar__qty">{fill(t('detail.inCart'), { n: cartQty })}</span>}
        </button>
      </div>
    </div>
  )
}
