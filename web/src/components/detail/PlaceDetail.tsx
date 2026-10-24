import type { DetailProps } from '../../screens/contracts'
import type { Key } from '../../lib/i18n'
import { useLang, useT } from '../../lib/i18n'
import { CategoryBadge, SponsorBadge, SubBar } from '../Common'
import { BlogReviews } from './BlogReviews'
import { MiniMap } from './MiniMap'
import { CartButton, HeroImage, Reasons, Sources, Tags, koreanName } from './parts'

const KIND_KEY: Record<DetailProps['item']['kind'], Key> = {
  product: 'detail.kind.product',
  place: 'detail.kind.place',
  guide: 'detail.kind.guide',
}

// 의료·장소·안내 상세(병원 상세 톤: 헤더 카드 → 안내 → 소개 → 위치 → 후기 → 출처 → 하단 고정 바).
export function PlaceDetail({ item, onBack, onAddTrip, onOpenCart, onGoTrip, cartQty, inTrip }: DetailProps) {
  const t = useT()
  const lang = useLang()
  const medical = item.category === 'medical'
  const ko = koreanName(item)
  const official = item.sources[0]

  return (
    <div className={`dt-page dt-page--${item.category}`}>
      <SubBar title={item.title} onBack={onBack} actions={<CartButton count={cartQty} onOpen={onOpenCart} />} />
      {item.image_url && <HeroImage item={item} />}

      <section className="dt-phead">
        <div className="dt-badges">
          <CategoryBadge category={item.category} />
          <span className="badge badge--outline">{t(KIND_KEY[item.kind])}</span>
          <SponsorBadge value={item.sponsorship} hideUnknown />
        </div>
        <h1 className="dt-title">{item.title}</h1>
        {item.subtitle && (
          <p className="dt-phead__ko">
            <span className="muted small">{t('detail.koreanName')}</span>
            <span lang="ko">{item.subtitle}</span>
          </p>
        )}
        {item.location?.address && (
          <p className="dt-phead__addr">
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 21s-6-5.4-6-11a6 6 0 1 1 12 0c0 5.6-6 11-6 11z" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="10" r="2.2" fill="currentColor" /></svg>
            <span lang="ko">{item.location.address}</span>
          </p>
        )}
      </section>

      {medical && (
        <div className="dt-notice">
          <p className="note note--medical" role="note">{t('detail.medicalNotice')}</p>
        </div>
      )}

      <div className="divider" />
      {item.description && (
        <section className="dt-sec">
          <h2 className="dt-h2">{t('detail.about')}</h2>
          <p className="dt-body">{item.description}</p>
          <Tags tags={item.tags} />
        </section>
      )}
      <Reasons reasons={item.reasons} />

      {item.location && (
        <>
          <div className="divider" />
          <section className="dt-sec" aria-labelledby="dt-loc-h">
            <h2 id="dt-loc-h" className="dt-h2">{t('detail.location')}</h2>
            {!item.location.address && <p className="small muted dt-gap">{t('detail.noAddress')}</p>}
            <MiniMap location={item.location} lang={lang} />
          </section>
        </>
      )}

      <div className="divider" />
      <BlogReviews query={ko} lang={lang} medical={medical} />
      <div className="divider" />
      <Sources item={item} />
      {official && (
        <div className="dt-sec dt-sec--tight">
          <a className="btn btn--ghost btn--block" href={official.url} target="_blank" rel="noreferrer noopener">{t('detail.officialSite')}</a>
        </div>
      )}

      <div className="dt-bar">
        <button
          type="button"
          className={`btn btn--lg dt-bar__main ${medical ? 'btn--medical dt-bar__main--medical' : 'btn--primary'}`}
          onClick={() => (inTrip ? onGoTrip() : onAddTrip(item))}
        >
          {inTrip ? t('detail.inTrip') : t('detail.addTrip')}
        </button>
      </div>
    </div>
  )
}
