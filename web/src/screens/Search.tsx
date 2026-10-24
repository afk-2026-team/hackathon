import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { SearchProps } from './contracts'
import type { BlogResponse, CatalogItem } from '../lib/types'
import { ApiError, fetchBlogReviews, fetchCatalog } from '../lib/api'
import { fill, useLang, useT } from '../lib/i18n'
import { SponsorBadge, SubBar } from '../components/Common'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { ItemRow } from '../components/explore/ItemRow'
import '../styles/explore.css'

// 담당: 탐색·검색·카트(D). 탭 두 개 — 우리 카탈로그(클라이언트 검색) / 웹 후기(NAVER 블로그 검색, 제출 시에만 호출).

type Tab = 'catalog' | 'blog'
type Load<T> = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string; noKey: boolean } | { status: 'ready'; data: T }

const RECENT_KEY = 'jinseonmi.search.recent'
const RECENT_MAX = 8
const DEBOUNCE_MS = 150
const RESULT_PAGE = 50

function readRecent(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}
function writeRecent(list: string[]) {
  try {
    sessionStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    /* 저장 못 해도 검색은 된다 */
  }
}

/** 대소문자 무시·한글 포함 부분일치. 공백으로 나눈 단어가 모두 들어 있어야 한다. */
export function matchItem(item: CatalogItem, query: string): boolean {
  return matchHay(hayOf(item), query)
}
const hayOf = (item: CatalogItem) =>
  [item.title, item.subtitle, item.description, item.location?.address ?? '', ...item.tags].join(' ').toLocaleLowerCase()
function matchHay(hay: string, query: string): boolean {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return false
  return words.every((w) => hay.includes(w))
}

/** 블로그 검색 결과의 강조 태그·엔티티를 걷어낸 순수 텍스트. */
function plain(text: string): string {
  const stripped = text.replace(/<[^>]*>/g, '')
  if (typeof DOMParser === 'undefined') return stripped
  return new DOMParser().parseFromString(stripped, 'text/html').documentElement.textContent ?? stripped
}

export function Search({ profile, onBack, onOpen }: SearchProps) {
  const t = useT()
  const lang = useLang()
  const inputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('catalog')
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [recent, setRecent] = useState<string[]>(readRecent)
  const [catalog, setCatalog] = useState<Load<CatalogItem[]>>({ status: 'loading' })
  const [blog, setBlog] = useState<Load<BlogResponse>>({ status: 'idle' })
  const blogFor = useRef('') // 마지막으로 블로그를 부른 검색어
  const [blogTry, setBlogTry] = useState(0)
  const [catalogTry, setCatalogTry] = useState(0)

  useEffect(() => inputRef.current?.focus(), [])

  useEffect(() => {
    let alive = true
    setCatalog({ status: 'loading' })
    fetchCatalog(lang)
      .then((c) => alive && setCatalog({ status: 'ready', data: c.items }))
      .catch((e: unknown) => alive && setCatalog({ status: 'error', message: e instanceof Error ? e.message : 'Search is unavailable.', noKey: false }))
    return () => {
      alive = false
    }
  }, [catalogTry, lang])

  // 블로그는 제출된 검색어가 바뀌었고 블로그 탭을 보고 있을 때만 부른다(타이핑마다 호출하지 않음).
  useEffect(() => {
    if (tab !== 'blog' || !submitted || submitted === blogFor.current) return
    let alive = true
    let done = false
    blogFor.current = submitted
    setBlog({ status: 'loading' })
    fetchBlogReviews(submitted)
      .then((data) => {
        done = true
        if (alive) setBlog({ status: 'ready', data })
      })
      .catch((e: unknown) => {
        done = true
        if (!alive) return
        blogFor.current = ''
        const status = e instanceof ApiError ? e.status : 0
        setBlog({ status: 'error', message: e instanceof Error ? e.message : 'Blog search failed.', noKey: status === 503 })
      })
    return () => {
      alive = false
      if (!done && blogFor.current === submitted) blogFor.current = '' // 중간에 끊긴 요청은 다음에 다시 부른다
    }
  }, [tab, submitted, blogTry])

  const submit = (q: string) => {
    const v = q.trim()
    if (!v) return
    setQuery(v)
    setSubmitted(v)
    const next = [v, ...recent.filter((r) => r !== v)].slice(0, RECENT_MAX)
    setRecent(next)
    writeRecent(next)
  }
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    submit(query)
  }
  const retryBlog = () => setBlogTry((n) => n + 1)

  // 입력은 바로 보이고, 카탈로그 거르기는 150ms 쉬었을 때만 한다(제출·최근 검색어는 즉시).
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const v = query.trim()
    if (v === debounced) return
    if (!v) {
      setDebounced('')
      return
    }
    const id = window.setTimeout(() => setDebounced(v), DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [query, debounced])
  const q = submitted === query.trim() ? submitted : debounced
  const hays = useMemo(() => (catalog.status === 'ready' ? catalog.data.map((i) => [i, hayOf(i)] as const) : []), [catalog])
  const results = useMemo(() => (q ? hays.filter(([, h]) => matchHay(h, q)).map(([i]) => i) : []), [hays, q])
  const [more, setMore] = useState({ q: '', n: RESULT_PAGE })
  const limit = more.q === q ? more.n : RESULT_PAGE
  const left = results.length - Math.min(limit, results.length)

  return (
    <div className="ex">
      <SubBar title={t('explore.searchTitle')} onBack={onBack} />
      <form className="ex-top" role="search" onSubmit={onSubmit}>
        <label className="searchbox">
          <span className="sr-only">{t('explore.searchLabel')}</span>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          <input ref={inputRef} type="search" value={query} placeholder={t('explore.searchPlaceholder')} onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" />
        </label>
        <button type="submit" className="btn btn--primary btn--small ex-submit">{t('explore.searchSubmit')}</button>
      </form>
      <div className="tabs" role="tablist">
        {(['catalog', 'blog'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tabs__item${tab === k ? ' is-on' : ''}`} onClick={() => setTab(k)}>
            {t(k === 'catalog' ? 'explore.tabCatalog' : 'explore.tabBlog')}
          </button>
        ))}
      </div>

      {!q && recent.length > 0 && (
        <section className="sec">
          <div className="sec-h">
            <h2>{t('explore.recent')}</h2>
            <button type="button" className="btn btn--text" onClick={() => { setRecent([]); writeRecent([]) }}>{t('explore.recentClear')}</button>
          </div>
          <div className="hscroll">
            {recent.map((r) => (
              <button key={r} type="button" className="chip" onClick={() => submit(r)}>{r}</button>
            ))}
          </div>
        </section>
      )}

      {tab === 'catalog' ? (
        catalog.status === 'loading' ? <LoadingState />
          : catalog.status === 'error' ? <ErrorState message={catalog.message} onRetry={() => setCatalogTry((n) => n + 1)} />
          : !q ? <p className="ex-hint">{t('explore.catalogHint')}</p>
          : results.length === 0 ? <EmptyState title={t('explore.catalogEmptyTitle')} body={fill(t('explore.catalogEmptyBody'), { q })} />
          : (
            <>
              <p className="ex-count">{fill(t('explore.catalogCount'), { n: results.length })}</p>
              <ul className="ex-list">
                {results.slice(0, limit).map((item) => <ItemRow key={item.id} item={item} currency={profile.currency} onOpen={onOpen} />)}
              </ul>
              {left > 0 && (
                <div className="ex-more">
                  <button type="button" className="btn btn--ghost ex-more__btn" onClick={() => setMore({ q, n: limit + RESULT_PAGE })}>
                    {fill(t('explore.more'), { n: left })}
                  </button>
                </div>
              )}
            </>
          )
      ) : (
        <BlogResults state={blog} query={submitted} onRetry={retryBlog} />
      )}
    </div>
  )
}

function BlogResults({ state, query, onRetry }: { state: Load<BlogResponse>; query: string; onRetry: () => void }) {
  const t = useT()
  if (!query || state.status === 'idle') return <p className="ex-hint">{t('explore.blogHint')}</p>
  if (state.status === 'loading') return <LoadingState />
  if (state.status === 'error') {
    return state.noKey
      ? <div className="ex-pad"><p className="note note--warn" role="alert">{t('explore.blogNoKey')}</p></div>
      : <ErrorState message={state.message} onRetry={onRetry} />
  }
  const { data } = state
  return (
    <>
      {data.items.length === 0 ? (
        <EmptyState title={t('explore.blogEmptyTitle')} body={fill(t('explore.blogEmptyBody'), { q: query })} />
      ) : (
        <>
          <div className="ex-pad"><p className="note">{t('explore.blogNote')}</p></div>
          {data.total > 0 && <p className="ex-count">{fill(t('explore.blogCount'), { n: data.total.toLocaleString() })}</p>}
          <ul className="ex-blog">
            {data.items.map((b) => (
              <li key={b.url} className="ex-blog__item">
                <a href={b.url} target="_blank" rel="noreferrer noopener" title={t('explore.blogOpen')} className="ex-blog__title">{plain(b.title)}</a>
                {b.excerpt && <p className="ex-blog__excerpt">{plain(b.excerpt)}</p>}
                <p className="ex-blog__meta">
                  <span>{b.author}</span>
                  {b.posted_on && <span>{b.posted_on}</span>}
                  <SponsorBadge value="unknown" />
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="ex-source provenance">{t('explore.blogSource')}</p>
    </>
  )
}
