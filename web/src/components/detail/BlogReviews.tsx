import { useEffect, useState } from 'react'
import { ApiError, fetchBlogReviews } from '../../lib/api'
import type { BlogResponse } from '../../lib/types'
import { fill, useT, type Lang } from '../../lib/i18n'
import { SponsorBadge } from '../Common'
import { LoadingState } from '../States'

// 블로그 후기(NAVER 블로그 검색). 서버 쪽 특약상 캐시하지 않으므로 화면 진입 때 한 번 부른다.
type State = { s: 'loading' } | { s: 'ready'; data: BlogResponse } | { s: 'error'; status: number; message: string }

export function BlogReviews({ query, lang, medical = false }: { query: string; lang: Lang; medical?: boolean }) {
  const t = useT()
  const [state, setState] = useState<State>({ s: 'loading' })

  useEffect(() => {
    let alive = true
    fetchBlogReviews(query, 5)
      .then((data) => alive && setState({ s: 'ready', data }))
      .catch((e: unknown) => {
        if (!alive) return
        setState({ s: 'error', status: e instanceof ApiError ? e.status : 0, message: e instanceof Error ? e.message : '' })
      })
    return () => {
      alive = false
    }
  }, [query])

  const numLocale = lang === 'ko' ? 'ko-KR' : 'en-US'
  return (
    <section className="dt-sec" aria-labelledby="dt-blog-h">
      <div className="sec-h">
        <div>
          <h2 id="dt-blog-h">{t('detail.blog')}</h2>
          {state.s === 'ready' && state.data.total > 0 && (
            <p className="sec-h__sub" title={t('detail.blogTotalNote')}>
              {fill(t('detail.blogTotal'), { n: state.data.total.toLocaleString(numLocale) })}
            </p>
          )}
        </div>
      </div>
      {medical && <p className="note note--medical dt-gap">{t('detail.blogMedical')}</p>}
      {state.s === 'loading' && <LoadingState />}
      {state.s === 'error' && (
        <p className="note" role="status">{state.status === 503 ? t('detail.blogNoKey') : state.message}</p>
      )}
      {state.s === 'ready' && state.data.items.length === 0 && <p className="note">{t('detail.blogEmpty')}</p>}
      {state.s === 'ready' && state.data.items.length > 0 && (
        <ul className="dt-blog">
          {state.data.items.map((b) => (
            <li key={b.url} className="dt-blog__item" data-testid="blog-item">
              <div className="dt-blog__badges">
                <SponsorBadge value={b.sponsorship} />
                {lang === 'en' && <span className="badge badge--outline">{t('detail.blogKorean')}</span>}
              </div>
              <a className="dt-blog__title" href={b.url} target="_blank" rel="noreferrer noopener" lang="ko">{b.title}</a>
              {b.excerpt && <p className="dt-blog__excerpt" lang="ko">{b.excerpt}</p>}
              <p className="dt-blog__meta">
                <span>{b.author}</span>
                {b.posted_on && <span>{b.posted_on}</span>}
                <a href={b.url} target="_blank" rel="noreferrer noopener" className="dt-link">{t('detail.blogOpen')}</a>
              </p>
            </li>
          ))}
        </ul>
      )}
      {state.s === 'ready' && state.data.total > 0 && <p className="provenance">{t('detail.blogTotalNote')}</p>}
      <p className="provenance dt-src">{t('detail.blogSource')}</p>
    </section>
  )
}
